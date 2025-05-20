// static/js/face_register.js
$(document).ready(function() {
    // 요소 참조
    const $webcam = $('#webcam');
    const $canvas = $('#canvas');
    const $capturePreview = $('#capturePreview');
    const $capturedImage = $('#capturedImage');
    const $startCameraBtn = $('#startCameraBtn');
    const $captureBtn = $('#captureBtn');
    const $personName = $('#personName');
    const $personDepartment = $('#personDepartment');
    const $personPosition = $('#personPosition');
    const $personEmployeeId = $('#personEmployeeId');
    const $saveBtn = $('#saveBtn');
    const $resetBtn = $('#resetBtn');
    const $spinner = $('#spinner');
    const $statusMessage = $('#statusMessage');
    const $capturedCount = $('#capturedCount');
    
    // 변수 설정
    let stream = null;
    let capturedImages = [null, null, null, null, null]; // 5장의 이미지를 저장할 배열
    let currentImageCount = 0; // 현재 촬영된 이미지 수
    let nextImageIndex = 0; // 다음 이미지를 저장할 인덱스
    const MAX_IMAGES = 5; // 최대 이미지 수
    const API_URL = window.location.origin;
    
    // 이미지 미리보기 아이템 초기화
    function initImagePreviews() {
        // 각 미리보기 아이템의 삭제 버튼에 이벤트 리스너 추가
        $('.delete-preview-btn').each(function() {
            $(this).on('click', function(e) {
                e.stopPropagation(); // 이벤트 버블링 방지
                const index = $(this).data('index');
                deleteImage(index);
            });
        });
    }
    
    // 이미지 업데이트 함수 (촬영된 이미지를 특정 슬롯에 표시)
    function updateImagePreview(index, imageData) {
        const $previewItem = $(`.image-preview-item[data-index="${index}"]`);
        
        // 이미지 요소가 없으면 생성
        if ($previewItem.find('img').length === 0) {
            $previewItem.append('<img src="" alt="촬영된 이미지">');
        }
        
        // 이미지 소스 설정
        $previewItem.find('img').attr('src', imageData);
        
        // 클래스 추가하여 스타일 변경
        $previewItem.addClass('has-image');
        
        // 이미지 카운트 업데이트 - 여기서는 호출하지 않고 captureImage에서 직접 호출
        // updateImageCount() 함수를 여기서 호출하지 않음
        
        console.log("이미지 미리보기 업데이트 완료:", index);
    }
    
    // 이미지 삭제 함수
    function deleteImage(index) {
        if (capturedImages[index] !== null) {
            // 배열에서 해당 인덱스의 이미지 데이터 제거
            capturedImages[index] = null;
            
            // UI에서 이미지 제거
            const $previewItem = $(`.image-preview-item[data-index="${index}"]`);
            $previewItem.removeClass('has-image');
            $previewItem.find('img').remove();
            
            // 이미지 카운트 감소
            currentImageCount--;
            
            // 카운트 표시 직접 업데이트
            $capturedCount.text(currentImageCount);
            
            // 디버깅 로그
            console.log(`이미지 삭제 완료: 현재 카운트 = ${currentImageCount}`, $capturedCount.text());
            
            // 삭제된 인덱스가 nextImageIndex보다 작으면 nextImageIndex 업데이트
            if (nextImageIndex > index || nextImageIndex >= MAX_IMAGES) {
                nextImageIndex = index;
            }
            
            // 저장 버튼 상태 업데이트
            updateSaveButtonState();
            
            updateStatus(`이미지 ${index + 1}이(가) 삭제되었습니다.`, 'info');
        }
    }
    
    // 이미지 카운트 업데이트 함수 - 이제 더 이상 사용하지 않습니다.
    // 직접 $capturedCount.text(currentImageCount)로 업데이트합니다.
    function updateImageCount() {
        // 현재 이미지 수를 화면에 표시
        $capturedCount.text(currentImageCount);
        console.log("이미지 카운트 업데이트 함수 호출됨:", currentImageCount, "화면 표시:", $capturedCount.text());
        
        // 저장 버튼 상태 업데이트
        updateSaveButtonState();
    }
    
    // 다음 사용 가능한 이미지 슬롯 찾기
    function findNextImageSlot() {
        // 현재 인덱스부터 시작해서 비어있는 슬롯 찾기
        for (let i = 0; i < MAX_IMAGES; i++) {
            if (capturedImages[i] === null) {
                return i;
            }
        }
        // 모든 슬롯이 차있으면 0번 슬롯 반환 (덮어쓰기)
        return 0;
    }
    
    // 저장 버튼 상태 업데이트
    function updateSaveButtonState() {
        // 5장의 이미지가 촬영되고 이름이 입력된 경우 저장 버튼 활성화
        if (currentImageCount >= 5 && $personName.val().trim() !== '') {
            $saveBtn.prop('disabled', false);
        } else {
            $saveBtn.prop('disabled', true);
        }
    }
    
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
        
        // 최대 이미지 수 확인
        if (currentImageCount >= MAX_IMAGES) {
            updateStatus('이미 최대 수량인 5장의 이미지가 촬영되었습니다. 불필요한 이미지를 삭제하고 다시 시도하세요.', 'warning');
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
        
        // 이미지 데이터 추출
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        
        // 다음 사용 가능한 슬롯 찾기
        nextImageIndex = findNextImageSlot();
        
        // 이미지 데이터 저장
        capturedImages[nextImageIndex] = imageData;
        
        // 이미지 카운트 증가
        currentImageCount++;
        
        // 이미지 미리보기 업데이트
        updateImagePreview(nextImageIndex, imageData);
        
        // 카운트 표시 직접 업데이트
        $capturedCount.text(currentImageCount);
        
        // 저장 버튼 상태 업데이트
        updateSaveButtonState();
        
        // 디버깅 로그
        console.log(`이미지 캡처 완료: 현재 카운트 = ${currentImageCount}`, $capturedCount.text());
        
        // 이미지 캡처 및 저장 완료 메시지
        updateStatus(`이미지 ${nextImageIndex + 1}이(가) 촬영되었습니다. (${currentImageCount}/${MAX_IMAGES})`, 'success');
        
        // 미리보기 잠시 표시 후 숨기기
        $capturedImage.attr('src', imageData);
        $webcam.addClass('hidden');
        $capturePreview.removeClass('hidden');
        
        // 1초 후 다시 카메라 표시
        setTimeout(function() {
            $webcam.removeClass('hidden');
            $capturePreview.addClass('hidden');
        }, 1000);
    }
    
    // 모든 입력 초기화 함수
    function resetForm() {
        // 입력 필드 초기화
        $personName.val('');
        $personDepartment.val('');
        $personPosition.val('');
        $personEmployeeId.val('');
        
        // 이미지 데이터 및 미리보기 초기화
        capturedImages = [null, null, null, null, null];
        currentImageCount = 0;
        nextImageIndex = 0;
        
        // 미리보기 UI 초기화
        $('.image-preview-item').each(function() {
            $(this).removeClass('has-image');
            $(this).find('img').remove();
        });
        
        // 카운트 표시 직접 업데이트
        $capturedCount.text('0');
        console.log("폼 초기화: 카운트 리셋됨");
        
        // 버튼 상태 업데이트
        $saveBtn.prop('disabled', true);
        
        updateStatus('모든 입력이 초기화되었습니다.', 'info');
    }
    
    // 특징 벡터 추출 및 저장 함수
    function saveFeatureVectors() {
        const name = $personName.val().trim();
        const department = $personDepartment.val().trim();
        const position = $personPosition.val().trim();
        const employeeId = $personEmployeeId.val().trim();
        
        if (!name) {
            updateStatus('인물 이름을 입력해주세요.', 'error');
            return;
        }
        
        if (currentImageCount === 0) {
            updateStatus('최소 한 장 이상의 사진을 촬영해주세요.', 'error');
            return;
        }
        
        // 유효한 이미지만 필터링
        const validImages = capturedImages.filter(img => img !== null);
        
        if (validImages.length === 0) {
            updateStatus('유효한 이미지가 없습니다.', 'error');
            return;
        }
        
        // 버튼 비활성화 및 로딩 표시
        $saveBtn.prop('disabled', true);
        $spinner.removeClass('hidden');
        updateStatus('얼굴 특징 벡터 추출 중...', 'info');
        
        // 순차적으로 모든 이미지 처리 (첫 번째 이미지부터 시작)
        processNextImage(0, validImages, {
            name: name,
            department: department,
            position: position,
            employeeId: employeeId
        });
    }
    
    // 순차적으로 이미지를 처리하는 재귀 함수
    function processNextImage(index, images, userData) {
        // 모든 이미지 처리 완료
        if (index >= images.length) {
            updateStatus(`${userData.name}의 얼굴 특징 벡터가 성공적으로 추출되어 저장되었습니다.`, 'success');
            
            // 버튼 활성화 및 로딩 표시 제거
            $saveBtn.prop('disabled', false);
            $spinner.addClass('hidden');
            
            // 사용자에게 완료 알림
            alert(`${userData.name}의 얼굴 특징 벡터가 성공적으로 추출되어 저장되었습니다. (${images.length}장의 이미지 처리 완료)`);
            
            // 입력 초기화
            resetForm();
            return;
        }
        
        // 현재 이미지에 대한 API 요청 데이터 준비
        const requestData = {
            name: userData.name,
            image: images[index],
            metadata: {
                department: userData.department,
                position: userData.position,
                employeeId: userData.employeeId,
                imageIndex: index + 1,
                totalImages: images.length
            }
        };
        
        // API 요청 전송
        $.ajax({
            url: `${API_URL}/api/capture-face`,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            success: function(response) {
                console.log(`이미지 ${index + 1}/${images.length} 처리 완료:`, response);
                updateStatus(`이미지 ${index + 1}/${images.length} 처리 완료`, 'info');
                
                // 다음 이미지 처리
                processNextImage(index + 1, images, userData);
            },
            error: function(xhr, status, error) {
                let errorMsg = '요청 처리 중 오류가 발생했습니다.';
                
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;
                }
                
                console.error(`이미지 ${index + 1} 처리 중 오류:`, error);
                updateStatus(`이미지 ${index + 1} 처리 중 오류: ${errorMsg}`, 'error');
                
                // 사용자에게 오류 알림
                alert(`이미지 ${index + 1} 처리 중 오류: ${errorMsg}`);
                
                // 버튼 활성화 및 로딩 표시 제거
                $saveBtn.prop('disabled', false);
                $spinner.addClass('hidden');
            }
        });
    }
    
    // 상태 메시지 업데이트 함수
    function updateStatus(message, type = 'info') {
        $statusMessage.text(message);
        
        // 타입에 따라 스타일 변경
        $('#statusBar').removeClass('success error warning info');
        $('#statusBar').addClass(type);
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    // 모바일 기기 감지 함수
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // 웹캠 크기 조정 시 이벤트 처리
    function onWebcamResize() {
        // 웹캠 컨테이너의 크기가 변경되면 캔버스 크기도 업데이트
        const $webcamContainer = $('.webcam-container');
        if ($webcamContainer.length > 0) {
            const containerWidth = $webcamContainer.width();
            const containerHeight = $webcamContainer.height();
            
            // 비디오 요소의 스타일 설정
            $webcam.css({
                'width': '100%',
                'height': '100%',
                'object-fit': 'cover'
            });
        }
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
        
        // 촬영 버튼
        $captureBtn.on('click', captureImage);
        
        // 저장 버튼
        $saveBtn.on('click', saveFeatureVectors);
        
        // 초기화 버튼
        $resetBtn.on('click', resetForm);
        
        // 이름 입력 시 저장 버튼 상태 업데이트
        $personName.on('input', updateSaveButtonState);
        
        // 웹캠 컨테이너 크기 변경 감지
        $(window).on('resize', onWebcamResize);
    }
    
    // 페이지 로드 시 실행
    function init() {
        // 이벤트 리스너 설정
        setupEventListeners();
        
        // 이미지 미리보기 초기화
        initImagePreviews();
        
        // 모바일 기기 여부 감지 및 UI 최적화
        if (isMobileDevice()) {
            // 모바일에 최적화된 UI 설정
            $('.container').addClass('mobile-optimized');
        }
        
        // 웹캠 컨테이너 크기 초기화
        onWebcamResize();
        
        // 초기 상태 업데이트
        updateStatus('준비 완료. 카메라 시작 버튼을 눌러 시작하세요.', 'info');
        
        // 초기 이미지 카운트 표시 강제 설정
        currentImageCount = 0;
        $capturedCount.text('0');
        updateSaveButtonState();
    }
    
    // 초기화 함수 호출
    init();
});