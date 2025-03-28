// static/js/face_compare.js
$(document).ready(function() {
    // 요소 참조
    const $webcam = $('#webcam');
    const $canvas = $('#canvas');
    const $faceDetectionStatus = $('#faceDetectionStatus');
    const $capturePreview = $('#capturePreview');
    const $capturedImage = $('#capturedImage');
    const $startCameraBtn = $('#startCameraBtn');
    const $recognitionStatus = $('#recognitionStatus');
    const $spinner = $('#spinner');
    const $compareResults = $('#compareResults');
    const $statusMessage = $('#statusMessage');
    const $modal = $('#modal');
    const $modalTitle = $('#modalTitle');
    const $modalBody = $('#modalBody');
    const $closeModal = $('.close');
    
    // 변수 설정
    let stream = null;
    let capturedImageData = null;
    let rawImageData = null;
    let isCameraActive = false;
    let isProcessing = false;
    let faceDetected = false;
    let faceRatio = 0;
    let lastCaptureTime = 0;
    let isComparingFace = false;
    let faceDetectionInterval = null;
    let isRegisteringAttendance = false;
    let attendanceRegistrationTimer = null;
    let resetPageTimer = null;
    const API_URL = window.location.origin;
    
    // 설정값
    const MIN_FACE_RATIO = 0.20;        // 최소 얼굴 비율 (전체 프레임 대비)
    const CAPTURE_COOLDOWN = 5000;      // 캡처 간 최소 간격 (밀리초)
    
    // 카메라 시작 함수
    function startCamera() {
        updateStatus('카메라 접근 요청 중...', 'info');
        
        // 웹캠 활성화
        navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'  // 전면 카메라
            }
        })
        .then(function(mediaStream) {
            stream = mediaStream;
            $webcam[0].srcObject = mediaStream;
            $webcam[0].play();
            
            // 비디오가 로드되면 카메라 초기화 완료
            $webcam[0].onloadedmetadata = function() {
                isCameraActive = true;
                
                // 카메라가 시작되면 버튼 상태 변경
                $startCameraBtn.text('카메라 중지');
                
                // 프리뷰 표시
                $webcam.removeClass('hidden');
                $capturePreview.addClass('hidden');
                $capturedImage.attr('src', '');
                
                // 실시간 얼굴 감지 시작 (약간의 지연 후)
                setTimeout(function() {
                    startFaceDetection();
                }, 1000);
                
                updateStatus('카메라가 활성화되었습니다. 얼굴을 감지하는 중...', 'success');
            };
        })
        .catch(function(error) {
            console.error('카메라 접근 오류:', error);
            updateStatus(`카메라 접근 오류: ${error.message}`, 'error');
        });
    }
    
    // 카메라 중지 함수
    function stopCamera() {
        if (stream) {
            // 얼굴 감지 중지
            if (faceDetectionInterval) {
                clearInterval(faceDetectionInterval);
                faceDetectionInterval = null;
            }
            
            // 비디오 스트림 중지
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            $webcam[0].srcObject = null;
            isCameraActive = false;
            
            // 버튼 상태 변경
            $startCameraBtn.text('카메라 시작');
            
            // 얼굴 감지 상태 숨기기
            $faceDetectionStatus.empty();
            
            // 비교 결과 초기화
            $compareResults.html('<p class="no-results">얼굴이 감지되면 자동으로 비교 결과가 표시됩니다.</p>');
            
            updateStatus('카메라가 중지되었습니다.', 'info');
        }
    }
    
    // 실시간 얼굴 감지 시작
    function startFaceDetection() {
        if (!stream || !isCameraActive) return;
        
        // 상태 초기화
        faceDetected = false;
        faceRatio = 0;
        $recognitionStatus.text('얼굴을 카메라에 비춰주세요...');
        
        // 이전 인터벌이 있으면 제거
        if (faceDetectionInterval) {
            clearInterval(faceDetectionInterval);
        }
        
        // 얼굴 감지 함수
        function detectFace() {
            if (!isCameraActive || isProcessing) return;
            
            isProcessing = true;
            
            try {
                // 캔버스 설정
                const video = $webcam[0];
                const canvas = $canvas[0];
                const context = canvas.getContext('2d');
                
                // 비디오 크기 확인
                const width = video.videoWidth;
                const height = video.videoHeight;
                
                if (!width || !height) {
                    console.log('비디오 크기가 유효하지 않음:', width, 'x', height);
                    isProcessing = false;
                    return;
                }
                
                // 비디오 크기에 맞게 캔버스 설정
                canvas.width = width;
                canvas.height = height;
                
                // 비디오 프레임을 캔버스에 그리기
                context.drawImage(video, 0, 0, width, height);
                
                // 이미지 데이터 가져오기 (원본)
                const originalImageData = canvas.toDataURL('image/jpeg');
                
                // 이미지 향상 적용
                const imgData = context.getImageData(0, 0, width, height);
                
                // 이미지 향상 (밝기와 대비 조정)
                const data = imgData.data;
                const alpha = 1.5;  // 대비 (1.0 = 원본)
                const beta = 30;    // 밝기 (-255 ~ 255)
                
                for (let i = 0; i < data.length; i += 4) {
                    // 빨강, 초록, 파랑 채널에 대해 대비와 밝기 조정
                    data[i] = Math.min(255, Math.max(0, alpha * data[i] + beta));
                    data[i+1] = Math.min(255, Math.max(0, alpha * data[i+1] + beta));
                    data[i+2] = Math.min(255, Math.max(0, alpha * data[i+2] + beta));
                }
                
                // 향상된 이미지 데이터를 캔버스에 그리기
                context.putImageData(imgData, 0, 0);
                
                // 향상된 이미지 데이터 가져오기
                const enhancedImageData = canvas.toDataURL('image/jpeg');
                
                // 얼굴 감지 API 호출
                $.ajax({
                    url: `${API_URL}/api/detect-face`,
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        image: enhancedImageData
                    }),
                    success: function(response) {
                        if (response.success) {
                            if (response.face_detected) {
                                // 얼굴이 감지된 경우
                                faceDetected = true;
                                
                                // 얼굴 비율 계산
                                const frameArea = width * height;
                                const faceArea = response.face_area.width * response.face_area.height;
                                faceRatio = faceArea / frameArea;
                                
                                // 얼굴 비율을 퍼센트로 변환
                                const ratioPercent = Math.round(faceRatio * 100);
                                
                                // 얼굴 크기에 따른 클래스 결정
                                let ratioClass = 'face-ratio-low';
                                if (faceRatio >= MIN_FACE_RATIO) {
                                    ratioClass = 'face-ratio-high';
                                } else if (faceRatio >= MIN_FACE_RATIO * 0.7) {
                                    ratioClass = 'face-ratio-medium';
                                }
                                
                                // 상태 메시지 표시
                                $faceDetectionStatus.html(`
                                    얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span>
                                `);
                                
                                // 얼굴 크기가 충분히 크면 사진 촬영
                                if (faceRatio >= MIN_FACE_RATIO) {
                                    const currentTime = Date.now();
                                    // 이전 캡처와의 시간 간격이 충분한지 확인
                                    if (currentTime - lastCaptureTime > CAPTURE_COOLDOWN && !isComparingFace) {
                                        // 바로 촬영 및 비교 시작
                                        captureAndCompare(enhancedImageData);
                                        $recognitionStatus.html(`<span class="confidence-high">얼굴 인식됨 - 비교 중...</span>`);
                                    }
                                } else {
                                    // 얼굴이 너무 작음
                                    $recognitionStatus.html(`얼굴이 너무 작습니다. 더 가까이 다가와주세요.`);
                                }
                            } else {
                                // 얼굴이 감지되지 않은 경우
                                faceDetected = false;
                                faceRatio = 0;
                                $faceDetectionStatus.empty();
                                $recognitionStatus.text('얼굴을 카메라에 비춰주세요...');
                            }
                        } else {
                            // 요청 처리 실패
                            $recognitionStatus.html(`<span class="confidence-low">오류: ${response.message}</span>`);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Face detection error:', error);
                        $recognitionStatus.html('<span class="confidence-low">얼굴 감지 오류</span>');
                    },
                    complete: function() {
                        isProcessing = false;
                    }
                });
            } catch (error) {
                console.error('이미지 처리 중 오류:', error);
                isProcessing = false;
            }
        }
        
        // 일정 간격으로 얼굴 감지 수행
        faceDetectionInterval = setInterval(detectFace, 500);
    }
    
    // 사진 촬영 및 비교 함수
    function captureAndCompare(enhancedImageData) {
        if (!stream || isComparingFace) {
            return;
        }
        
        // 상태 업데이트
        isComparingFace = true;
        $spinner.removeClass('hidden');
        $recognitionStatus.text('얼굴 비교 중...');
        updateStatus('얼굴 비교 중...', 'info');
        
        // 캡처 시간 기록
        lastCaptureTime = Date.now();
        
        // 캡처된 이미지 데이터 저장
        capturedImageData = enhancedImageData;
        
        // API 요청 데이터 준비
        const requestData = {
            image: capturedImageData
        };
        
        // API 요청 - 얼굴 비교
        $.ajax({
            url: `${API_URL}/api/compare-face`,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            success: function(response) {
                if (response.success) {
                    // 비교 결과 표시
                    displayCompareResults(response);
                    updateStatus('얼굴 비교가 완료되었습니다.', 'success');
                    
                    // 비교 결과에 따라 인식 상태 업데이트
                    if (response.matches && response.matches.length > 0) {
                        const bestMatch = response.matches[0];
                        const confidence = Math.round(bestMatch.confidence * 100);
                        $recognitionStatus.html(`<span class="confidence-high">${bestMatch.name} 님이 인식되었습니다 (유사도: ${confidence}%)</span>`);
                    } else {
                        $recognitionStatus.html(`<span class="confidence-low">등록된 얼굴과 일치하지 않습니다</span>`);
                    }
                } else {
                    updateStatus(`얼굴 비교 실패: ${response.message}`, 'error');
                    $compareResults.html(`<p class="no-results">얼굴 비교 실패: ${response.message}</p>`);
                    $recognitionStatus.text('얼굴을 다시 인식해주세요.');
                }
            },
            error: function(xhr, status, error) {
                let errorMsg = '얼굴 비교 중 오류가 발생했습니다.';
                
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;
                }
                
                console.error('Error:', error);
                updateStatus(`오류: ${errorMsg}`, 'error');
                $compareResults.html(`<p class="no-results">오류: ${errorMsg}</p>`);
                $recognitionStatus.text('얼굴을 다시 인식해주세요.');
            },
            complete: function() {
                // 로딩 표시 제거 및 처리 상태 초기화
                $spinner.addClass('hidden');
                isComparingFace = false;
            }
        });
    }
    
    // 비교 결과 표시 함수
    function displayCompareResults(response) {
        if (response.matches && response.matches.length > 0) {
            // 가장 일치도가 높은 결과
            const bestMatch = response.matches[0];
            const otherMatches = response.matches.slice(1);
            
            // 신뢰도에 따른 스타일 클래스
            let confidenceClass = 'match-low';
            let barClass = 'bar-low';
            let confidenceText = '낮음';
            let isHighConfidence = false;
            
            const confidence = bestMatch.confidence;
            if (confidence >= 0.8) {
                confidenceClass = 'match-high';
                barClass = 'bar-high';
                confidenceText = '높음';
                isHighConfidence = true;
            } else if (confidence >= 0.6) {
                confidenceClass = 'match-medium';
                barClass = 'bar-medium';
                confidenceText = '중간';
            }
            
            // 신뢰도 퍼센트로 변환
            const confidencePercent = Math.round(confidence * 100);
            
            // 높은 신뢰도인 경우 자동으로 출퇴근 등록
            if (isHighConfidence) {
                // 이미 출퇴근 등록 중이 아니면 타이머 설정
                if (!attendanceRegistrationTimer) {
                    attendanceRegistrationTimer = setTimeout(function() {
                        registerAttendance(bestMatch.name, confidence);
                        attendanceRegistrationTimer = null;
                    }, 500); // 0.5초 후 자동 등록
                }
            }
            
            // 결과 HTML 생성
            let resultsHtml = `
                <div class="match-result">
                    <div class="match-header ${confidenceClass}">
                        <span>${bestMatch.name} 님과 일치</span>
                        <span class="confidence-info">일치도: ${confidencePercent}% (${confidenceText})</span>
                    </div>
                    <div class="match-body">
                        <div class="match-images">
                            <div class="match-image-container">
                                <div class="match-image-title">촬영된 얼굴</div>
                                <img src="${capturedImageData}" alt="촬영된 얼굴" class="match-image">
                            </div>
                            <div class="match-image-container">
                                <div class="match-image-title">등록된 얼굴</div>
                                <img src="data:image/jpeg;base64,${bestMatch.image_base64}" alt="${bestMatch.name}" class="match-image">
                            </div>
                        </div>
                        <div class="match-details">
                            <div class="match-info-item">
                                <div class="match-info-label">이름:</div>
                                <div class="match-info-value">${bestMatch.name}</div>
                            </div>
                            <div class="match-info-item">
                                <div class="match-info-label">등록일:</div>
                                <div class="match-info-value">${formatDate(bestMatch.timestamp)}</div>
                            </div>
                            <div class="match-info-item">
                                <div class="match-info-label">일치도:</div>
                                <div class="match-info-value">
                                    <span class="${confidenceClass}">${confidencePercent}% (${confidenceText})</span>
                                    <div class="confidence-bar-container">
                                        <div class="confidence-bar ${barClass}" style="width: ${confidencePercent}%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
            `;
            
            // 높은 신뢰도가 아니면 수동 출퇴근 등록 버튼을 표시하고, 
            // 높은 신뢰도이면 자동 등록 메시지 표시
            if (!isHighConfidence) {
                resultsHtml += `
                        <div class="match-actions">
                            <button class="register-attendance-btn primary-btn" data-name="${bestMatch.name}" data-id="${bestMatch.id}">
                                ${bestMatch.name} 님으로 출퇴근 등록
                            </button>
                        </div>
                `;
            } else {
                resultsHtml += `
                        <div class="match-actions">
                            <div class="auto-register-message">
                                <span class="spinner"></span> 자동으로 출퇴근 등록 중...
                            </div>
                        </div>
                `;
            }
            
            resultsHtml += `
                    </div>
                </div>
            `;
            
            // 다른 유사한 얼굴 표시 (신뢰도에 상관없이 항상 표시)
            if (otherMatches && otherMatches.length > 0) {
                resultsHtml += `
                    <div class="multiple-results">
                        <div class="multiple-title">다른 유사한 얼굴 (${otherMatches.length})</div>
                        <div class="result-list">
                `;
                
                otherMatches.forEach(match => {
                    const matchPercent = Math.round(match.confidence * 100);
                    resultsHtml += `
                        <div class="result-item" data-name="${match.name}" data-id="${match.id}">
                            <img src="data:image/jpeg;base64,${match.image_base64}" alt="${match.name}" class="result-image">
                            <div class="result-name">${match.name}</div>
                            <div class="result-confidence">일치도: ${matchPercent}%</div>
                            <button class="select-face-btn secondary-btn">선택</button>
                        </div>
                    `;
                });
                
                resultsHtml += `
                        </div>
                    </div>
                `;
            }
            
            // 결과 표시
            $compareResults.html(resultsHtml);
            
            // 출퇴근 등록 버튼 이벤트 설정
            $('.register-attendance-btn').on('click', function() {
                const name = $(this).data('name');
                registerAttendance(name, confidence, capturedImageData);
            });
            
            // 다른 얼굴 선택 버튼 이벤트 설정
            $('.select-face-btn').on('click', function() {
                const name = $(this).parent().data('name');
                registerAttendance(name, confidence, capturedImageData);
            });
            
        } else {
            // 일치하는 얼굴이 없는 경우
            $compareResults.html(`
                <div class="match-result">
                    <div class="match-header match-low">
                        <span>일치하는 얼굴을 찾을 수 없습니다</span>
                    </div>
                    <div class="match-body">
                        <div class="match-images">
                            <div class="match-image-container">
                                <div class="match-image-title">촬영된 얼굴</div>
                                <img src="${capturedImageData}" alt="촬영된 얼굴" class="match-image">
                            </div>
                        </div>
                        <div class="match-details">
                            <p>얼굴 데이터베이스에서 일치하는 얼굴을 찾을 수 없습니다.</p>
                            <p>등록된 얼굴이 없거나 유사도가 너무 낮을 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            `);
        }
    }
    
    // 출퇴근 기록 함수
    function registerAttendance(name, confidence, imageData = null) {
        if (isRegisteringAttendance) return;
        
        isRegisteringAttendance = true;
        $spinner.removeClass('hidden');
        updateStatus('출퇴근 기록 중...', 'info');
        
        // API 요청 데이터 준비
        const requestData = {
            name: name,
            image: imageData // 이미지 데이터 항상 함께 전송하여 얼굴 추가 등록
        };
        
        // API 요청
        $.ajax({
            url: `${API_URL}/api/register-attendance`,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            success: function(response) {
                if (response.success) {
                    // 성공 메시지 표시
                    showAttendanceSuccess(response);
                    
                    // 5초 후 페이지 초기화
                    resetPageTimer = setTimeout(function() {
                        resetPageAfterAttendance();
                    }, 5000);
                } else {
                    updateStatus(`출퇴근 기록 실패: ${response.message}`, 'error');
                }
            },
            error: function(xhr, status, error) {
                let errorMsg = '출퇴근 기록 중 오류가 발생했습니다.';
                
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;
                }
                
                console.error('Error:', error);
                updateStatus(`오류: ${errorMsg}`, 'error');
            },
            complete: function() {
                $spinner.addClass('hidden');
                isRegisteringAttendance = false;
            }
        });
    }
    
    // 출퇴근 성공 화면 표시
    function showAttendanceSuccess(data) {
        // 성공 메시지 HTML 생성
        const tagClass = getTagClass(data.tag);
        
        const successHtml = `
            <div class="attendance-success">
                <div class="attendance-icon">✓</div>
                <div class="attendance-name">${data.name}</div>
                <div class="attendance-time">${data.date} ${data.time}</div>
                ${data.tag ? `<div class="attendance-tag ${tagClass}">${data.tag}</div>` : ''}
                <div class="attendance-message">출퇴근 기록이 성공적으로 저장되었습니다.</div>
                ${data.face_registered ? '<div class="face-registered-message">새로운 얼굴 이미지가 등록되었습니다.</div>' : ''}
                <div class="countdown">5초 후 초기화됩니다...</div>
            </div>
        `;
        
        // 화면에 추가
        $('body').append(successHtml);
        
        // 카운트다운 표시
        let countdown = 5;
        const countdownInterval = setInterval(function() {
            countdown--;
            $('.countdown').text(`${countdown}초 후 초기화됩니다...`);
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
            }
        }, 1000);
    }
    
    // 태그에 따른 클래스 반환
    function getTagClass(tag) {
        if (tag === '출근') return 'tag-clock-in';
        if (tag === '지각') return 'tag-late';
        if (tag === '퇴근') return 'tag-clock-out';
        return 'tag-none';
    }
    
    // 출퇴근 등록 후 페이지 초기화
    function resetPageAfterAttendance() {
        // 성공 메시지 제거
        $('.attendance-success').fadeOut(500, function() {
            $(this).remove();
        });
        
        // 타이머 초기화
        if (resetPageTimer) {
            clearTimeout(resetPageTimer);
            resetPageTimer = null;
        }
        
        // 결과 초기화
        $compareResults.html('<p class="no-results">얼굴이 감지되면 자동으로 비교 결과가 표시됩니다.</p>');
        
        // 상태 초기화
        lastCaptureTime = 0;
        capturedImageData = null;
        $recognitionStatus.text('얼굴을 카메라에 비춰주세요...');
        
        // 카메라가 켜져 있으면 얼굴 감지 다시 시작
        if (isCameraActive) {
            startFaceDetection();
        }
        
        updateStatus('준비 완료. 얼굴을 카메라에 비춰주세요.', 'info');
    }
    
    // 상태 메시지 업데이트 함수
    function updateStatus(message, type = 'info') {
        $statusMessage.text(message);
        
        // 타입에 따라 스타일 변경
        $('#statusBar').removeClass('success error warning info');
        $('#statusBar').addClass(type);
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    // 모달 표시 함수
    function showModal(title, content) {
        $modalTitle.text(title);
        $modalBody.html(content);
        $modal.css('display', 'block');
    }
    
    // 날짜 포맷팅 함수
    function formatDate(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        
        if (isNaN(date.getTime())) {
            return dateString; // 변환할 수 없는 경우 원본 반환
        }
        
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // 이벤트 리스너 설정
    $startCameraBtn.on('click', function() {
        if (stream) {
            stopCamera();
        } else {
            startCamera();
        }
    });
    
    // 모달 닫기
    $closeModal.on('click', function() {
        $modal.css('display', 'none');
    });
    
    $(window).on('click', function(event) {
        if (event.target === $modal[0]) {
            $modal.css('display', 'none');
        }
    });
    
    // 초기화 시 타이머 정리
    if (attendanceRegistrationTimer) {
        clearTimeout(attendanceRegistrationTimer);
        attendanceRegistrationTimer = null;
    }

    if (resetPageTimer) {
        clearTimeout(resetPageTimer);
        resetPageTimer = null;
    }
    
    // 페이지 로드 시 실행
    updateStatus('준비 완료. 카메라 시작 버튼을 눌러 시작하세요.', 'info');
});