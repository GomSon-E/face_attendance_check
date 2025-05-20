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
    const API_URL = window.location.origin;
    
    // 카메라 시작 함수
    function startCamera() {
        updateStatus('카메라 접근 요청 중...', 'info');
        
        // 기존 스트림이 있으면 중지
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        // 웹캠 활성화 - 모바일 환경에 적합한 설정 추가
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
            
            updateStatus('카메라가 활성화되었습니다. 사진을 촬영하세요.', 'success');
        })
        .catch(function(error) {
            console.error('카메라 접근 오류:', error);
            updateStatus(`카메라 접근 오류: ${error.message}`, 'error');
            
            // 모바일 환경에서 더 명확한 오류 메시지
            if (error.name === 'NotAllowedError') {
                updateStatus('카메라 접근 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.', 'error');
            } else if (error.name === 'NotFoundError') {
                updateStatus('카메라를 찾을 수 없습니다. 기기에 카메라가 있는지 확인해주세요.', 'error');
            }
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
    
    // 사진 촬영 함수 - 좌우반전 적용
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
        
        // 좌우반전 적용 - video 요소가 transform: scaleX(-1)로 표시되므로 실제 캡처 시에도 반전 적용
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        
        // 비디오 프레임을 캔버스에 그리기 (좌우반전 상태로)
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 캔버스 변환 상태 초기화 (필요시 추가 그리기를 위해)
        context.setTransform(1, 0, 0, 1, 0, 0);
        
        // 이미지 데이터 저장 (좌우반전된 상태로)
        capturedImageData = canvas.toDataURL('image/jpeg');
        
        // 미리보기 설정
        $capturedImage.attr('src', capturedImageData);
        $webcam.addClass('hidden');
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
        $capturePreview.addClass('hidden');
        $capturedImage.attr('src', '');
        capturedImageData = null;
        
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
        let requestData = {
            name: name,
            image: capturedImageData
        };
        
        // API 요청 전송
        sendApiRequest(requestData);
    }
    
    // API 요청 전송 함수
    function sendApiRequest(requestData) {
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
        $capturedImage.attr('src', '');
        $capturePreview.addClass('hidden');
        $webcam.removeClass('hidden');
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
    
    // 모바일 기기 감지 함수
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // 이벤트 리스너 설정
    function setupEventListeners() {
        // 카메라 시작/중지 버튼
        $startCameraBtn.on('click', function() {
            if (stream) {
                stopCamera();
            } else {
                startCamera();
            }
        });
        
        // 촬영 및 관련 버튼
        $captureBtn.on('click', captureImage);
        $retakeBtn.on('click', retake);
        $saveBtn.on('click', saveFeatureVector);
        $refreshButton.on('click', loadFacesList);
        
        // 모달 닫기
        $closeModal.on('click', function() {
            $modal.css('display', 'none');
        });
        
        // 모달 외부 클릭 시 닫기
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
        
        // 모바일 환경에서 가로/세로 방향 변경 시 카메라 재조정
        window.addEventListener('orientationchange', function() {
            if (stream) {
                // 간단히 비디오 요소를 리셋해서 새 방향에 맞게 조정
                const currentDisplay = $webcam.css('display');
                $webcam.css('display', 'none');
                setTimeout(function() {
                    $webcam.css('display', currentDisplay);
                }, 100);
            }
        });
    }
    
    // 페이지 로드 시 실행
    function init() {
        setupEventListeners();
        
        // 모바일 기기 여부 감지 및 UI 최적화
        if (isMobileDevice()) {
            // 모바일에 최적화된 UI 설정
            $('.container').addClass('mobile-optimized');
            
            // iOS Safari에서 비디오 자동 재생 속성 추가
            $webcam.attr('playsinline', ''); 
        }
        
        updateStatus('준비 완료. 카메라 시작 버튼을 눌러 시작하세요.', 'info');
        loadFacesList();
    }
    
    // 초기화 함수 호출
    init();
});