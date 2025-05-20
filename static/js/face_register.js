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
    
    // 사진 촬영 함수 (화면에 보이는 영역만 캡처)
    function captureImage() {
        if (!stream) {
            updateStatus('카메라가 활성화되지 않았습니다.', 'error');
            return;
        }
        
        // 비디오 요소 참조
        const video = $webcam[0];
        
        // 캔버스 참조
        const canvas = $canvas[0];
        const context = canvas.getContext('2d');
        
        // 화면에 표시되는 비디오의 실제 크기 계산
        const videoElement = $webcam[0];
        const displayWidth = videoElement.offsetWidth;
        const displayHeight = videoElement.offsetHeight;
        
        // 캔버스 크기를 디스플레이 크기와 동일하게 설정
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        
        // 비디오의 원본 크기
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        // 비디오가 화면에 표시되는 비율 계산
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = videoWidth;
        let sourceHeight = videoHeight;
        
        // 비디오와 화면의 비율 비교
        const videoRatio = videoWidth / videoHeight;
        const displayRatio = displayWidth / displayHeight;
        
        if (videoRatio > displayRatio) {
            // 비디오가 더 넓은 경우, 높이를 맞추고 너비를 자름
            sourceWidth = videoHeight * displayRatio;
            sourceX = (videoWidth - sourceWidth) / 2;
        } else {
            // 비디오가 더 높은 경우, 너비를 맞추고 높이를 자름
            sourceHeight = videoWidth / displayRatio;
            sourceY = (videoHeight - sourceHeight) / 2;
        }
        
        // 좌우반전을 위한 변환
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        
        // 계산된 영역에 맞게 비디오를 캔버스에 그림
        context.drawImage(
            video,
            sourceX, sourceY, sourceWidth, sourceHeight,  // 소스 영역
            0, 0, canvas.width, canvas.height             // 캔버스 크기에 맞춤
        );
        
        // 캔버스 변환 상태 초기화
        context.setTransform(1, 0, 0, 1, 0, 0);
        
        // 이미지 데이터 저장
        capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
        
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

                alert('특징 벡터가 성공적으로 추출되었습니다.');
                
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

                alert(`추출 실패: ${errorMsg}`);
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
    
    // 웹캠 크기 조정 시 이벤트 처리
    function onWebcamResize() {
        // 웹캠 컨테이너의 크기가 변경되면 캔버스 크기도 업데이트
        const $webcamContainer = $('.webcam-container');
        if ($webcamContainer.length > 0) {
            const containerWidth = $webcamContainer.width();
            const containerHeight = $webcamContainer.height();
            
            // 디버깅 정보 출력
            console.log(`웹캠 컨테이너 크기: ${containerWidth}x${containerHeight}`);
            
            // 비디오 요소의 스타일 설정
            $webcam.css({
                'width': '100%',
                'height': '100%',
                'object-fit': 'cover'
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
        
        // 웹캠 컨테이너 크기 변경 감지
        $(window).on('resize', onWebcamResize);
    }
    
    // 페이지 로드 시 실행
    function init() {
        setupEventListeners();
        
        // 모바일 기기 여부 감지 및 UI 최적화
        if (isMobileDevice()) {
            // 모바일에 최적화된 UI 설정
            $('.container').addClass('mobile-optimized');
        
        }
        
        // 웹캠 컨테이너 크기 초기화
        onWebcamResize();
        
        updateStatus('준비 완료. 카메라 시작 버튼을 눌러 시작하세요.', 'info');
        loadFacesList();
    }
    
    // 초기화 함수 호출
    init();
});