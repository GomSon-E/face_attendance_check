// static/js/face_register.js
$(document).ready(function() {
    // 요소 참조
    const $webcam = $('#webcam');
    const $canvas = $('#canvas');
    const $capturePreview = $('#capturePreview');
    const $capturedImage = $('#capturedImage');
    const $startCameraBtn = $('#startCameraBtn');
    const $captureBtn = $('#captureBtn');
    const $retakeBtn = $('#retakeBtn');
    const $personName = $('#personName');
    const $saveBtn = $('#saveBtn');
    const $spinner = $('#spinner');
    const $refreshButton = $('#refreshButton');
    const $resultsList = $('#resultsList');
    const $statusMessage = $('#statusMessage');
    const $modal = $('#modal');
    const $modalTitle = $('#modalTitle');
    const $modalBody = $('#modalBody');
    const $closeModal = $('.close');
    
    // 변수 설정
    let stream = null;
    let capturedImageData = null;
    let rawImageData = null;  // 원본 이미지 데이터
    const API_URL = window.location.origin;
    
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
            
            // 카메라가 시작되면 버튼 상태 변경
            $startCameraBtn.text('카메라 중지');
            $captureBtn.prop('disabled', false);
            
            // 프리뷰 표시
            $webcam.removeClass('hidden');
            $capturePreview.addClass('hidden');
            $capturedImage.attr('src', '');
            
            // 버튼 표시/숨김
            $retakeBtn.addClass('hidden');
            
            // 실시간 이미지 향상 처리 시작
            startImageEnhancement();
            
            updateStatus('카메라가 활성화되었습니다. 사진을 촬영하세요.', 'success');
        })
        .catch(function(error) {
            console.error('카메라 접근 오류:', error);
            updateStatus(`카메라 접근 오류: ${error.message}`, 'error');
        });
    }
    
    // 카메라 중지 함수
    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            $webcam[0].srcObject = null;
            
            // 버튼 상태 변경
            $startCameraBtn.text('카메라 시작');
            $captureBtn.prop('disabled', true);
            
            updateStatus('카메라가 중지되었습니다.', 'info');
        }
    }
    
    // 실시간 이미지 향상 처리
    function startImageEnhancement() {
        if (!stream) return;
        
        const video = $webcam[0];
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // 향상된 이미지를 화면에 표시하는 함수
        function processFrame() {
            if (!stream) return;  // 스트림이 없으면 처리하지 않음
            
            const width = video.videoWidth;
            const height = video.videoHeight;
            
            // 비디오 프레임을 캔버스에 그리기
            if (width && height) {
                canvas.width = width;
                canvas.height = height;
                context.drawImage(video, 0, 0, width, height);
                
                // 이미지 데이터 가져오기
                const imageData = context.getImageData(0, 0, width, height);
                
                // 이미지 향상 (밝기와 대비 조정)
                enhanceImageData(imageData);
                
                // 향상된 이미지 데이터를 다시 캔버스에 그리기
                context.putImageData(imageData, 0, 0);
                
                // 비디오 요소 대신 캔버스를 화면에 표시
                video.style.display = 'none';
                if (!canvas.parentNode) {
                    // 캔버스가 아직 DOM에 추가되지 않았다면 추가
                    $(canvas).addClass('enhanced-preview');
                    $(video).after(canvas);
                }
            }
            
            // 다음 프레임 처리
            requestAnimationFrame(processFrame);
        }
        
        // 향상된 이미지 처리 시작
        processFrame();
    }
    
    // 이미지 데이터 향상 함수 (밝기와 대비 조정)
    function enhanceImageData(imageData) {
        const data = imageData.data;
        const alpha = 1.5;  // 대비 (1.0 = 원본)
        const beta = 30;    // 밝기 (-255 ~ 255)
        
        for (let i = 0; i < data.length; i += 4) {
            // 빨강, 초록, 파랑 채널에 대해 대비와 밝기 조정
            data[i] = Math.min(255, Math.max(0, alpha * data[i] + beta));
            data[i+1] = Math.min(255, Math.max(0, alpha * data[i+1] + beta));
            data[i+2] = Math.min(255, Math.max(0, alpha * data[i+2] + beta));
            // 알파 채널은 변경하지 않음 (data[i+3])
        }
    }
    
    // 사진 촬영 함수
    function captureImage() {
        if (!stream) {
            updateStatus('카메라가 활성화되지 않았습니다.', 'error');
            return;
        }
        
        // 캔버스 설정
        const video = $webcam[0];
        const canvas = $canvas[0];
        const context = canvas.getContext('2d');
        
        // 비디오 크기에 맞게 캔버스 설정
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // 비디오 프레임을 캔버스에 그리기
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 원본 이미지 데이터 저장
        rawImageData = canvas.toDataURL('image/jpeg');
        
        // 향상된 이미지 처리
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        enhanceImageData(imageData);
        context.putImageData(imageData, 0, 0);
        
        // 향상된 이미지 데이터 저장
        capturedImageData = canvas.toDataURL('image/jpeg');
        
        // 미리보기 설정 (향상된 이미지 표시)
        $capturedImage.attr('src', capturedImageData);
        $webcam.addClass('hidden');
        $('.enhanced-preview').addClass('hidden');  // 향상된 비디오 미리보기 숨기기
        $capturePreview.removeClass('hidden');
        
        // 버튼 상태 변경
        $captureBtn.prop('disabled', true);
        $retakeBtn.removeClass('hidden');
        $saveBtn.prop('disabled', false);
        
        updateStatus('사진이 촬영되었습니다. 특징 벡터를 추출하려면 이름을 입력하고 저장 버튼을 누르세요.', 'success');
    }
    
    // 다시 촬영 함수
    function retake() {
        if (!stream) {
            startCamera();
            return;
        }
        
        // 프리뷰 초기화
        $webcam.removeClass('hidden');
        $('.enhanced-preview').removeClass('hidden');  // 향상된 비디오 미리보기 표시
        $capturePreview.addClass('hidden');
        $capturedImage.attr('src', '');
        capturedImageData = null;
        rawImageData = null;
        
        // 버튼 상태 변경
        $captureBtn.prop('disabled', false);
        $retakeBtn.addClass('hidden');
        $saveBtn.prop('disabled', true);
        
        updateStatus('다시 촬영합니다.', 'info');
    }
    
    // 특징 벡터 추출 및 저장 함수
    function saveFeatureVector() {
        const name = $personName.val().trim();
        
        if (!name) {
            updateStatus('인물 이름을 입력해주세요.', 'error');
            return;
        }
        
        if (!capturedImageData) {
            updateStatus('먼저 사진을 촬영해주세요.', 'error');
            return;
        }
        
        // 버튼 비활성화 및 로딩 표시
        $saveBtn.prop('disabled', true);
        $spinner.removeClass('hidden');
        updateStatus('얼굴 특징 벡터 추출 중...', 'info');
        
        // API 요청 데이터 준비
        const requestData = {
            name: name,
            image: capturedImageData  // 향상된 이미지 데이터 사용
        };
        
        // API 요청
        $.ajax({
            url: `${API_URL}/api/capture-face`,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            success: function(response) {
                updateStatus('특징 벡터가 성공적으로 추출되었습니다.', 'success');
                
                // 성공 모달 표시
                showModal('추출 성공', `
                    <p class="success-message">${response.message}</p>
                    <p><strong>이름:</strong> ${response.name}</p>
                    <p><strong>벡터 길이:</strong> ${response.vector_length}</p>
                    <img src="data:image/jpeg;base64,${response.image_base64}" alt="${response.name}" class="result-image">
                `);
                
                // 입력 초기화
                resetInputs();
                
                // 결과 목록 새로고침
                loadFacesList();
            },
            error: function(xhr, status, error) {
                let errorMsg = '요청 처리 중 오류가 발생했습니다.';
                
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;
                }
                
                console.error('Error:', error);
                updateStatus(`오류: ${errorMsg}`, 'error');
                
                // 오류 모달 표시
                showModal('추출 실패', `
                    <p class="error-message">${errorMsg}</p>
                    <p>다시 시도하거나 다른 사진을 촬영해보세요.</p>
                `);
            },
            complete: function() {
                // 버튼 활성화 및 로딩 표시 제거
                $saveBtn.prop('disabled', false);
                $spinner.addClass('hidden');
            }
        });
    }
    
    // 입력 초기화 함수
    function resetInputs() {
        $personName.val('');
        capturedImageData = null;
        rawImageData = null;
        $capturedImage.attr('src', '');
        $capturePreview.addClass('hidden');
        $webcam.removeClass('hidden');
        $('.enhanced-preview').removeClass('hidden');  // 향상된 비디오 미리보기 표시
        $retakeBtn.addClass('hidden');
        $saveBtn.prop('disabled', true);
        $captureBtn.prop('disabled', false);
    }
    
    // 얼굴 목록 불러오기 함수
    function loadFacesList() {
        updateStatus('저장된 얼굴 목록을 불러오는 중...', 'info');
        
        $.ajax({
            url: `${API_URL}/api/faces`,
            type: 'GET',
            success: function(data) {
                if (data.faces && data.faces.length > 0) {
                    $resultsList.empty();
                    
                    $.each(data.faces, function(i, face) {
                        const faceCard = $(`
                            <div class="face-card">
                                <img src="data:image/jpeg;base64,${face.image_base64}" alt="${face.name}" class="face-image">
                                <div class="face-info">
                                    <div class="face-name">${face.name}</div>
                                    <div class="face-details">
                                        <div>등록일: ${formatDate(face.timestamp)}</div>
                                    </div>
                                    <div class="face-actions">
                                        <button class="delete-button" data-id="${face.id}">삭제</button>
                                    </div>
                                </div>
                            </div>
                        `);
                        
                        $resultsList.append(faceCard);
                    });
                    
                    updateStatus('얼굴 목록을 불러왔습니다.', 'success');
                } else {
                    $resultsList.html('<p class="no-results">저장된 얼굴이 없습니다.</p>');
                    updateStatus('저장된 얼굴이 없습니다.', 'info');
                }
            },
            error: function(xhr, status, error) {
                console.error('Error fetching faces:', error);
                $resultsList.html('<p class="no-results">얼굴 목록을 불러오는 데 실패했습니다.</p>');
                updateStatus('얼굴 목록을 불러오는 데 실패했습니다.', 'error');
            }
        });
    }
    
    // 얼굴 삭제 함수
    function deleteFace(faceId) {
        if (confirm('정말로 이 얼굴 데이터를 삭제하시겠습니까?')) {
            updateStatus('얼굴 데이터 삭제 중...', 'info');
            
            $.ajax({
                url: `${API_URL}/api/faces/${faceId}`,
                type: 'DELETE',
                success: function(data) {
                    updateStatus('얼굴 데이터가 삭제되었습니다.', 'success');
                    loadFacesList(); // 목록 새로고침
                },
                error: function(xhr, status, error) {
                    console.error('Error deleting face:', error);
                    updateStatus('얼굴 데이터 삭제 중 오류가 발생했습니다.', 'error');
                }
            });
        }
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
    
    $captureBtn.on('click', captureImage);
    $retakeBtn.on('click', retake);
    $saveBtn.on('click', saveFeatureVector);
    $refreshButton.on('click', loadFacesList);
    
    // 모달 닫기
    $closeModal.on('click', function() {
        $modal.css('display', 'none');
    });
    
    $(window).on('click', function(event) {
        if (event.target === $modal[0]) {
            $modal.css('display', 'none');
        }
    });
    
    // 동적으로 생성된 삭제 버튼에 대한 이벤트 위임
    $resultsList.on('click', '.delete-button', function() {
        const faceId = $(this).data('id');
        deleteFace(faceId);
    });
    
    // 페이지 로드 시 실행
    updateStatus('준비 완료. 카메라 시작 버튼을 눌러 시작하세요.', 'info');
    loadFacesList();
});