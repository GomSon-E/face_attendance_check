// 카메라 스트림 객체
var streamVideo = null;
// 비디오 요소
var cameraView = document.getElementById("cameraview");
// 상태 표시 div 요소들
var faceDetectionStatusElement = document.getElementById("faceDetectionStatus");
var recognitionStatusElement = document.getElementById("recognitionStatus");
var errorStatusElement = document.getElementById("errorStatus");
// 캔버스 요소 및 2D 컨텍스트
var hiddenCanvas = document.getElementById("hiddenCanvas");
var ctx = hiddenCanvas ? hiddenCanvas.getContext("2d") : null; // hiddenCanvas가 null이 아닐 때만 context 가져옴

// 결과 팝업 관련 요소들
var resultPopupOverlay = document.getElementById("result-popup-overlay");
var resultPopupContent = document.getElementById("result-popup-content");
var popupTitleElement = document.getElementById("popup-title");
var popupMessageElement = document.getElementById("popup-message");
var matchListElement = document.getElementById("match-list");
var popupCloseButton = document.getElementById("popup-close-button");
var matchedFaceImageElement = document.getElementById("matchedFaceImage");


// --- 상태 플래그 ---
// 현재 프레임 처리 (캡처, 전송, 응답 대기) 중인지
var isProcessing = false;
// 얼굴 비교 작업이 진행 중인지
var isComparingFace = false;


// --- 설정 값 ---
// 얼굴 영역이 전체 프레임의 최소 몇 %를 차지해야 충분히 크다고 판단할지
const MIN_FACE_RATIO = 0.1;
// API 전송 시 이미지 크기 축소 비율
const IMAGE_SCALE_FACTOR = 0.5;

// 비디오의 현재 프레임을 캡처하여 얼굴 감지 API로 전송
function captureFrameAndSend() {
    // 비디오가 준비되지 않았거나, 이미 처리 중이거나, 비교 작업 중이면 함수 종료
    if (!cameraView || !streamVideo || cameraView.paused || cameraView.ended || isComparingFace) {
         // 비교 작업 중이 아니면 다음 프레임 예약
         if (!isComparingFace) {
             requestAnimationFrame(captureFrameAndSend);
         } else {
         }
        return;
    }
    
    // 이미 전송 중인 경우 바로 다음 프레임 예약하고 종료
    if (isProcessing) {
         requestAnimationFrame(captureFrameAndSend);
         return;
    }


    isProcessing = true; // 프레임 처리 시작 플래그 설정

    // 비디오 메타데이터 로드 대기 (videoWidth/videoHeight 사용 가능 확인)
    if (!cameraView || cameraView.videoWidth === 0 || cameraView.videoHeight === 0) {
         isProcessing = false; // 플래그 해제
         requestAnimationFrame(captureFrameAndSend); // 다음 프레임에서 다시 시도
         return;
    }

     // 캔버스 컨텍스트 유효성 재확인 (capture 루프 내에서 안전 장치)
    if (!ctx || !hiddenCanvas) {
        console.error("Canvas context or element is not available during capture.");
        isProcessing = false;
        if(errorStatusElement) {
             errorStatusElement.textContent = "오류: 캔버스 문제 발생.";
             errorStatusElement.className = 'status-error';
        }
        // 심각한 오류이므로 루프 중단 고려
        isComparingFace = true; // 캔버스 오류 시 루프 중단
        closeCamera(); // 카메라 종료
        return;
    }


    // 캔버스 크기를 비디오의 실제 크기에 맞춰 그릴 크기로 조절
    const drawWidth = cameraView.videoWidth * IMAGE_SCALE_FACTOR;
    const drawHeight = cameraView.videoHeight * IMAGE_SCALE_FACTOR;
    
    hiddenCanvas.width = drawWidth;
    hiddenCanvas.height = drawHeight;

    // 현재 비디오 프레임을 캔버스에 그립니다.
    ctx.drawImage(cameraView, 0, 0, drawWidth, drawHeight);

    // 캔버스 이미지 데이터를 JPEG Base64 문자열로 가져옵니다.
    // "data:image/jpeg;base64," 접두사를 제거합니다.
    const imageData = hiddenCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

     // 얼굴 감지 API로 데이터 전송
    fetch('/api/detect-face', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json' // JSON 형식으로 전송
        },
        body: JSON.stringify({ image: imageData }) // 이미지 데이터를 JSON 본문에 담아 전송
    })
    .then(response => {
        // HTTP 오류(예: 400, 500) 처리
        if (!response.ok) {
            console.error(`Detect API HTTP error! status: ${response.status}`);
             // JSON 파싱 실패 대비 catch 추가
             return response.json().then(errorData => {
                 console.error("Detect API Error Response:", errorData);
                 throw new Error(`Detect API HTTP error! status: ${response.status}, detail: ${errorData.detail || 'Unknown API Error'}`);
             }).catch(jsonError => {
                 console.error("Failed to parse Detect API error response or construct error:", jsonError);
                 throw new Error(`Detect API HTTP error! status: ${response.status}, ${response.statusText}`);
             });
        }
        return response.json(); // 응답 본문을 JSON으로 파싱
    })
    .then(data => {
        // --- 얼굴 감지 API 응답 처리 ---
        if(errorStatusElement) { errorStatusElement.textContent = ''; errorStatusElement.className = ''; } // API 통신 성공 시 오류 메시지 초기화

        if (data && data.success === true) {
            if (data.face_detected === true && data.face_area) {
                // 얼굴 감지 성공 및 얼굴 영역 데이터 존재

                // 얼굴 크기 계산 (프레임 대비 얼굴 영역 비율)
                const frameArea = drawWidth * drawHeight; // 캔버스(축소된 프레임) 영역
                const faceArea = data.face_area.width * data.face_area.height; // 얼굴 영역
                let currentFaceRatio = frameArea > 0 ? faceArea / frameArea : 0;

                // 비율을 퍼센트로 변환 (소수점 제거)
                const ratioPercent = Math.round(currentFaceRatio * 100);

                // 얼굴 크기에 따라 상태 메시지 클래스 결정
                let ratioClass = 'face-ratio-low';
                let ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (작음)`;
                if (recognitionStatusElement) {
                    recognitionStatusElement.textContent = '얼굴을 더 가까이 비춰주세요.';
                    recognitionStatusElement.className = 'status-waiting';
                }


                if (currentFaceRatio >= MIN_FACE_RATIO) {
                    ratioClass = 'face-ratio-high'; // 충분히 큼
                    ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (충분함)`;
                
                    if (recognitionStatusElement) {
                        recognitionStatusElement.textContent = '얼굴 크기 확인 완료. 인식 시작...';
                        recognitionStatusElement.className = 'status-success';
                    }
                
                    // *** 얼굴 감지 응답에서 얼굴 영역 데이터 추출 ***
                    const faceArea = data.face_area;
                    // 얼굴 영역 여백을 약간 추가하기 위해 20% 더 크게 추출 (얼굴이 잘리는 것 방지)
                    const margin = 0.2;
                    
                    // 여백을 추가한 얼굴 영역 계산
                    let faceX = Math.max(0, faceArea.x - faceArea.width * margin);
                    let faceY = Math.max(0, faceArea.y - faceArea.height * margin);
                    let faceWidth = Math.min(drawWidth - faceX, faceArea.width * (1 + margin * 2));
                    let faceHeight = Math.min(drawHeight - faceY, faceArea.height * (1 + margin * 2));
                    
                    // 얼굴 영역 추출을 위한 새 캔버스 생성
                    const faceCanvas = document.createElement('canvas');
                    const faceCtx = faceCanvas.getContext('2d');
                    
                    // 얼굴 영역 캔버스 크기 설정 (원본 이미지 크기에서의 얼굴 영역)
                    faceCanvas.width = faceWidth;
                    faceCanvas.height = faceHeight;
                    
                    // 원본 이미지에서 얼굴 영역만 새 캔버스에 그림
                    faceCtx.drawImage(
                        hiddenCanvas, 
                        faceX, faceY, faceWidth, faceHeight, // 소스 이미지의 얼굴 영역
                        0, 0, faceWidth, faceHeight // 대상 캔버스에 그릴 위치와 크기
                    );
                    
                    // 압축 비율 적용 (50%)
                    const compressCanvas = document.createElement('canvas');
                    const compressCtx = compressCanvas.getContext('2d');
                    compressCanvas.width = faceWidth * IMAGE_SCALE_FACTOR;
                    compressCanvas.height = faceHeight * IMAGE_SCALE_FACTOR;
                    
                    // 얼굴 이미지를 압축 캔버스에 그림
                    compressCtx.drawImage(
                        faceCanvas,
                        0, 0, faceWidth, faceHeight, // 소스 이미지(얼굴 캔버스)의 전체 영역
                        0, 0, compressCanvas.width, compressCanvas.height // 압축된 크기
                    );
                    
                    // 압축된 얼굴 이미지 데이터를 Base64 문자열로 변환
                    const faceImageData = compressCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    
                    // isComparingFace 플래그를 여기서 바로 설정하여 captureFrameAndSend 루프 중지
                    isComparingFace = true; // 비교 시작 플래그 설정
                    // 압축된 얼굴 이미지 데이터와 원본 비율을 전달
                    performFaceComparison(faceImageData, ratioPercent, imageData); // 세 번째 매개변수로 원본 이미지도 함께 전달
                    // detection 루프는 isComparingFace 플래그로 중단
                } else if (currentFaceRatio >= MIN_FACE_RATIO * 0.7) { // MIN_FACE_RATIO의 70% 이상
                    ratioClass = 'face-ratio-medium';
                    ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (중간)`;
                    if (recognitionStatusElement) {
                        recognitionStatusElement.textContent = '조금 더 가까이 다가와주세요.';
                         recognitionStatusElement.className = 'status-waiting';
                    }

                } else {
                     // 얼굴 감지되었으나 비율이 MIN_FACE_RATIO * 0.7 미만인 경우
                      ratioClass = 'face-ratio-low';
                      ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (매우 작음)`;
                       if (recognitionStatusElement) {
                           recognitionStatusElement.textContent = '얼굴을 카메라 중앙에 크게 비춰주세요.';
                           recognitionStatusElement.className = 'status-waiting';
                       }
                }

                // 얼굴 감지 상태 메시지 업데이트 (얼굴 크기 표시)
                if (faceDetectionStatusElement) {
                    faceDetectionStatusElement.innerHTML = ratioMessage;
                    faceDetectionStatusElement.className = 'status-normal';
                }


            } else {
                // API 응답은 성공했으나 얼굴 미감지 시

                // 상태 메시지 초기화 또는 얼굴 미감지 메시지 표시
                 if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = '얼굴 크기: -'; faceDetectionStatusElement.className = 'status-normal'; }
                 if (recognitionStatusElement) { recognitionStatusElement.textContent = '얼굴을 카메라에 비춰주세요...'; recognitionStatusElement.className = 'status-waiting'; }
            }
        } else {
            // API 응답 실패 시
             console.error("Detect API returned success: false", data);

             if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = '얼굴 크기: -'; faceDetectionStatusElement.className = 'status-normal'; }
             if (recognitionStatusElement) { recognitionStatusElement.innerHTML = `감지 요청 실패: ${data?.message || '알 수 없는 오류'}`; recognitionStatusElement.className = 'status-error'; }
        }
    })
    .catch(error => {
        // 얼굴 감지 API 요청 자체 실패
        console.error("Detect API request failed:", error);
        // 상태 표시 업데이트
        if(errorStatusElement) { errorStatusElement.textContent = `감지 API 통신 오류: ${error.message}`; errorStatusElement.className = 'status-error'; }

         // 얼굴 감지 안 된 것으로 간주 (루프는 계속 진행)
         if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = '얼굴 크기: -'; faceDetectionStatusElement.className = 'status-normal'; }
         if (recognitionStatusElement) { recognitionStatusElement.textContent = '얼굴을 카메라에 비춰주세요...'; recognitionStatusElement.className = 'status-waiting'; }
    })
    .finally(() => {
        isProcessing = false; // 프레임 처리 완료 플래그 해제

        // 비교 작업 중이 아니면 다음 프레임 캡처 예약
        if (!isComparingFace) {
             requestAnimationFrame(captureFrameAndSend);
        } else {
        }
    });
}

// 얼굴 비교 API로 이미지 데이터를 전송하고 결과를 처리하는 함수
async function performFaceComparison(faceImageData, finalFaceRatioPercent, originalImageData = null) {
    if (recognitionStatusElement) { recognitionStatusElement.textContent = '얼굴 인식 중...'; recognitionStatusElement.className = 'status-waiting'; }
    if (errorStatusElement) { errorStatusElement.textContent = ''; errorStatusElement.className = ''; } // 오류 메시지 초기화

    console.log("Starting face comparison with API using cropped face image.");

    try {
       const response = await fetch('/api/compare-face', {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json' // JSON 형식으로 전송
           },
           body: JSON.stringify({ 
               image: faceImageData // 추출 및 압축된 얼굴 이미지
           })
       });

       if (!response.ok) {
           console.error(`Compare API HTTP error! status: ${response.status}`);
           const errorData = await response.json().catch(() => ({detail: response.statusText})); // JSON 파싱 실패 대비
           console.error("Compare API Error Response:", errorData);
           throw new Error(`Compare API HTTP error! status: ${response.status}, detail: ${errorData.detail || 'Unknown API Error'}`);
       }

       const data = await response.json(); // 응답 본문을 JSON으로 파싱
       console.log("Compare API Response:", data);

        // --- 얼굴 비교 API 응답 처리 ---
       if (data && data.success === true) {
           if (data.total_matches > 0 && Array.isArray(data.matches) && data.matches.length > 0) {
               // 일치하는 얼굴이 발견됨

                // *** 가장 유사도가 높은 얼굴 찾기 ***
                const bestMatch = data.matches.reduce((prev, current) => {
                    if (typeof prev?.confidence !== 'number') return current;
                    if (typeof current?.confidence !== 'number') return prev;
                    return (prev.confidence > current.confidence) ? prev : current;
                }, data.matches[0]); // 초기값으로 첫 번째 요소 사용

                if (recognitionStatusElement) { 
                    recognitionStatusElement.textContent = `얼굴 인식 성공! (${bestMatch?.name || '일치'}: ${bestMatch?.confidence !== undefined ? Math.round(bestMatch.confidence * 100) + '%' : '정보 없음'})`; 
                    recognitionStatusElement.className = 'status-success'; 
                }

                // *** 백엔드에서 반환하는 가장 일치하는 얼굴 이미지 데이터 ***
                const bestMatchImageData = bestMatch.image_base64 || null;
                const personName = bestMatch.name || '알 수 없음';
                const confidencePercent = bestMatch.confidence !== undefined ? Math.round(bestMatch.confidence * 100) : 0;

                // 결과 팝업 표시 - 가장 유사도가 높은 얼굴 정보 및 이미지 표시
                // 수정: 메시지 형식 변경 - showResultPopup 함수가 이를 파싱하기 때문
                showResultPopup(
                    '얼굴 인식 성공!',
                    `가장 일치하는 얼굴: ${personName} (유사도: ${confidencePercent}%)`,
                    bestMatchImageData, // 이미지 데이터 전달
                    'success'
                );

           } else {
               // 일치하는 얼굴이 없음 (matches 배열이 비어있거나 total_matches가 0)
                if (recognitionStatusElement) { recognitionStatusElement.textContent = '일치하는 얼굴 없음.'; recognitionStatusElement.className = 'status-normal'; }

               // 결과 팝업 표시 - 일치 없음 메시지 (이미지 데이터는 없음)
               showResultPopup(
                   '일치하는 얼굴 없음',
                   '등록된 얼굴 중에 일치하는 얼굴을 찾지 못했습니다.',
                   null, // 이미지 데이터 없음
                   'normal'
               );
           }
       } else {
           // API 응답 실패 시
            console.error("Compare API returned success: false", data);
            if (recognitionStatusElement) { recognitionStatusElement.innerHTML = `인식 요청 실패: ${data?.message || '알 수 없는 오류'}`; recognitionStatusElement.className = 'status-error'; }

            // 결과 팝업 표시 - 오류 메시지
           showResultPopup('얼굴 인식 오류', `인식 요청 처리 중 오류가 발생했습니다: ${data?.message || '알 수 없는 오류'}`, null, 'error');
       }

    } catch (error) {
        // 얼굴 비교 API 요청 자체 실패
       console.error("Compare API request failed:", error);
       if(errorStatusElement) { errorStatusElement.textContent = `인식 API 통신 오류: ${error.message}`; errorStatusElement.className = 'status-error'; }
       if (recognitionStatusElement) { recognitionStatusElement.textContent = '얼굴 인식 오류 발생'; recognitionStatusElement.className = 'status-error'; }

        // 결과 팝업 표시 - 오류 메시지
       showResultPopup('얼굴 인식 오류', `API 통신 중 오류가 발생했습니다: ${error.message}`, null, 'error');

    } finally {
        isComparingFace = false; // 비교 작업 완료 플래그 해제
        isProcessing = false; // 모든 처리가 끝났으므로 처리 중 플래그 해제

        // 얼굴 비교 프로세스가 완료되었으므로 카메라 스트림 종료
        closeCamera();
    }
}


// 결과 팝업을 표시하는 함수 (성공, 실패, 일치 없음 등)
function showResultPopup(title, message, imageDataUrl, type = 'success') { // imageDataUrl 인자 추가
   // 팝업 내용 업데이트
   popupTitleElement.textContent = title;
   
   if (type === 'success' && imageDataUrl) {
       // 인식 성공 시 새로운 형태의 메시지로 변경
       const matchInfo = message.match(/가장 일치하는 얼굴: ([^(]+) \(유사도: (\d+)%\)/);
       const personName = matchInfo ? matchInfo[1].trim() : '알 수 없음';
       const similarity = matchInfo ? matchInfo[2] : '0';
       
       // 새로운 확인 메시지로 변경
       popupMessageElement.innerHTML = `
           <p>인식된 사용자: <strong>${personName}</strong></p>
           <p>유사도: <strong>${similarity}%</strong></p>
           <p class="confirmation-question">본인이 맞습니까?</p>
           <div class="confirmation-buttons">
               <button id="confirmYesBtn" class="confirm-btn yes-btn">네, 맞습니다</button>
               <button id="confirmNoBtn" class="confirm-btn no-btn">아니오, 다른 사람입니다</button>
           </div>
       `;
       
       // 확인 버튼에 이벤트 리스너 추가
       setTimeout(() => {
           const yesBtn = document.getElementById('confirmYesBtn');
           const noBtn = document.getElementById('confirmNoBtn');
           
           if (yesBtn) {
               yesBtn.addEventListener('click', function() {
                   handleConfirmation(true, personName);
               });
           }
           
           if (noBtn) {
               noBtn.addEventListener('click', function() {
                   handleConfirmation(false, personName);
               });
           }
       }, 100);
       
       // 기존 '확인' 버튼 숨기기
       if (popupCloseButton) {
           popupCloseButton.style.display = 'none';
       }
   } else if (type === 'normal') {
       // 일치하는 얼굴이 없는 경우
       popupMessageElement.innerHTML = `
           <p>등록된 얼굴 중에 일치하는 얼굴을 찾지 못했습니다.</p>
           <p>얼굴 등록 페이지에서 먼저 등록해주세요.</p>
       `;
       
       // 기존 '확인' 버튼 표시
       if (popupCloseButton) {
           popupCloseButton.style.display = 'block';
           popupCloseButton.textContent = '확인';
       }
   } else {
       // 오류 상황 등 다른 경우
       popupMessageElement.innerHTML = message;
       
       // 기존 '확인' 버튼 표시
       if (popupCloseButton) {
           popupCloseButton.style.display = 'block';
           popupCloseButton.textContent = '확인';
       }
   }

    // 이미지 데이터 처리
    if (imageDataUrl) {
        matchedFaceImageElement.src = `data:image/jpeg;base64,${imageDataUrl}`; // src 설정
        matchedFaceImageElement.style.display = 'block'; // 이미지 보이게 함
        // 필요시 이미지에 상태별 클래스 추가
        matchedFaceImageElement.className = type || '';
    } else {
        matchedFaceImageElement.src = ''; // src 비우기
        matchedFaceImageElement.style.display = 'none'; // 이미지 숨김
        matchedFaceImageElement.className = ''; // 클래스 초기화
    }

   // 팝업 제목/메시지/버튼 색상 등을 타입에 따라 변경
   if (resultPopupContent) {
       resultPopupContent.className = ''; // 기존 클래스 초기화
       resultPopupContent.classList.add('result-popup-content'); // 기본 클래스 추가
       if (type) { // 타입이 제공되면 추가
            resultPopupContent.classList.add(type);
        }
   }
   // 개별 요소의 클래스 설정 시에도 null 체크
   if (popupTitleElement) popupTitleElement.className = type || '';
   if (popupMessageElement) popupMessageElement.className = type || '';
   if (popupCloseButton) popupCloseButton.className = type || ''; // 버튼 색상 변경용 클래스

   // 팝업 표시
   if (resultPopupOverlay) { // 요소가 null이 아닐 때만 표시
       resultPopupOverlay.classList.add('visible');
   }
}

// 사용자 확인 처리 함수
function handleConfirmation(isConfirmed, personName) {
    if (isConfirmed) {
        // 사용자가 '네, 맞습니다' 버튼을 클릭한 경우
        // 여기에 출석/퇴근 기록 등의 처리를 할 수 있습니다
        popupMessageElement.innerHTML = `
            <p><strong>${personName}</strong>님 환영합니다!</p>
            <p>출석이 성공적으로 기록되었습니다.</p>
        `;
        
        // API 호출할 수도 있음
        // registerAttendanceAPI(personName);
    } else {
        // 사용자가 '아니오, 다른 사람입니다' 버튼을 클릭한 경우
        popupMessageElement.innerHTML = `
            <p>인식 정보가 정확하지 않습니다.</p>
            <p>관리자에게 문의하거나 얼굴 등록을 다시 해주세요.</p>
        `;
    }
    
    // 확인 버튼 표시
    if (popupCloseButton) {
        popupCloseButton.style.display = 'block';
        popupCloseButton.textContent = '닫기';
    }
}

// 결과 팝업을 숨기는 함수
function hideResultPopup() {
    if (resultPopupOverlay) { // 요소가 null인지 확인
        resultPopupOverlay.classList.remove('visible');
        // 팝업 닫은 후 추가 작업 (여기서는 이미 카메라 종료됨)
        console.log("Result popup closed.");
    } else {
         console.warn("Result popup overlay element not found when trying to hide popup.");
    }
}

// 카메라 스트림 시작 및 비디오 재생
async function openCamera() {
    try {
        // 상태 메시지 초기화 시에도 null 체크
        if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "카메라 접근 요청 중..."; faceDetectionStatusElement.className = 'status-waiting'; }
        if (recognitionStatusElement) { recognitionStatusElement.textContent = ''; recognitionStatusElement.className = ''; }
        if (errorStatusElement) { errorStatusElement.textContent = ''; errorStatusElement.className = ''; }


        // 기존 스트림이 있으면 중지
        if (streamVideo) {
             const tracks = streamVideo.getTracks();
             tracks.forEach(track => track.stop());
        }
        streamVideo = null;
        // cameraView가 null이 아닐 때만 srcObject 설정
        if (cameraView) cameraView.srcObject = null;

        // 카메라 제약 조건 설정 (전면 카메라, 이상적인 해상도)
        const constraints = {
            video: {
                facingMode: { ideal: "user" }, // 전면 카메라 사용
                 width: { ideal: 1280 }, // 이상적인 해상도 요청
                 height: { ideal: 720 }
            }
        };

        // 카메라 스트림 가져오기
        streamVideo = await navigator.mediaDevices.getUserMedia(constraints);
        // cameraView가 null이 아닐 때만 srcObject 설정
        if (cameraView) cameraView.srcObject = streamVideo;

        // 비디오 스트림 재생
        // cameraView가 null이 아닐 때만 play() 호출
        if (cameraView) {
             cameraView.play().then(() => {
                 console.log("Video playback started.");

                 // 비디오 메타데이터 로드 대기
                 // metadata가 로드되면 captureFrameAndSend 시작
                 cameraView.onloadedmetadata = () => {
                      console.log("Video metadata loaded. Starting capture loop.");
                      // 상태 메시지 업데이트 시 null 체크
                      if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "카메라 상태: 활성화됨."; faceDetectionStatusElement.className = 'status-normal'; }
                      if (recognitionStatusElement) { recognitionStatusElement.textContent = '얼굴을 카메라에 비춰주세요...'; recognitionStatusElement.className = 'status-waiting'; }
                      if (errorStatusElement) { errorStatusElement.textContent = ''; errorStatusElement.className = ''; }

                      // 상태 플래그 초기화
                      isProcessing = false;
                      isComparingFace = false;

                      // 프레임 캡처 루프 시작
                      captureFrameAndSend();
                 };
                  // 메타데이터가 이미 로드된 경우 (빠른 새로고침 등), 핸들러 수동 호출
                 if(cameraView.readyState >= 2) {
                     cameraView.onloadedmetadata();
                 } else {
                     // 메타데이터 로드 이벤트가 발생하지 않을 경우를 대비한 안전 장치
                      console.warn("Video metadata not loaded yet, readyState:", cameraView.readyState);
                      // 상태 메시지 업데이트 시 null 체크
                      if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "카메라 상태: 활성화됨. 메타데이터 로드 대기 중..."; faceDetectionStatusElement.className = 'status-waiting'; }
                      // metadata 로드 이벤트 리스너 추가
                      cameraView.addEventListener('loadedmetadata', cameraView.onloadedmetadata, { once: true });
                 }


             }).catch(error => {
                 console.error("비디오 재생 실패:", error);
                 // 상태 메시지 업데이트 시 null 체크
                 if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "오류: 비디오 재생 실패"; faceDetectionStatusElement.className = 'status-error'; }
                 if (recognitionStatusElement) { recognitionStatusElement.textContent = error.message; recognitionStatusElement.className = 'status-error'; }
                 if (errorStatusElement) { errorStatusElement.textContent = ''; errorStatusElement.className = ''; }
                 alert("카메라 재생에 실패했습니다."); // 사용자에게 알림
                 closeCamera(); // 재생 실패 시 카메라 중지
             });
        } else {
             console.error("Camera view element is null, cannot play video.");
              if (errorStatusElement) { errorStatusElement.textContent = "오류: 비디오 요소 로드 실패."; errorStatusElement.className = 'status-error'; }
        }

    } catch (error) {
        console.error("카메라 접근 오류:", error);
         // 상태 메시지 업데이트 시 null 체크
         if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "오류: 카메라 접근 실패"; faceDetectionStatusElement.className = 'status-error'; }
         if (recognitionStatusElement) { recognitionStatusElement.textContent = ''; recognitionStatusElement.className = ''; }
         if (errorStatusElement) { errorStatusElement.textContent = error.message; errorStatusElement.className = 'status-error'; }
        alert("카메라 접근에 실패했습니다: " + error.message); // 사용자에게 알림
    }
}

// 카메라 스트림 중지 함수
function closeCamera() {
    // 루프 중단 플래그 설정 (detection 및 comparison 루프 모두 체크)
    isComparingFace = true; // 비교 루프 중단을 위해 설정

    if (streamVideo) {
        console.log("Stopping camera stream.");
        const tracks = streamVideo.getTracks();
        tracks.forEach(track => track.stop());
        streamVideo = null;
        // cameraView가 null이 아닐 때만 srcObject 설정 해제
        if (cameraView) cameraView.srcObject = null;
        // 캔버스 클리어 - ctx, hiddenCanvas가 null이 아닐 때만
        if(ctx && hiddenCanvas) {
            ctx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
        }
        // 비디오 요소의 크기 스타일 초기화 - cameraView가 null이 아닐 때만
         if (cameraView) {
             cameraView.style.width = '';
             cameraView.style.height = '';
         }

        // 최종 상태 메시지 표시 및 플래그 초기화
        // 상태 메시지 업데이트 시 null 체크
        if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "카메라 상태: 종료됨"; faceDetectionStatusElement.className = 'status-normal'; }
        // recognitionStatusElement와 errorStatusElement는 마지막 메시지를 유지
    } else {
         // 스트림이 이미 null인 경우에도 상태 메시지만 업데이트
         console.log("Camera stream already stopped.");
         if (faceDetectionStatusElement) { faceDetectionStatusElement.textContent = "카메라 상태: 이미 종료됨"; faceDetectionStatusElement.className = 'status-normal'; }
    }

     // 플래그 초기화 (closeCamera가 완료되면 다음 openCamera 호출 시 재시작을 위해)
     isComparingFace = false; 
     isProcessing = false;
}

// 페이지 로드 시 초기화 및 카메라 자동 실행
function init() {
    console.log("Page initialized.");

    // 결과 팝업 닫기 버튼 이벤트 리스너 연결
    popupCloseButton.addEventListener('click', hideResultPopup);

    // 페이지 로드 시 자동으로 카메라 열기 시도
    openCamera();
}

// DOMContentLoaded 이벤트 발생 시 init 함수 호출
window.addEventListener('DOMContentLoaded', init);

// 페이지를 벗어나거나 닫을 때 카메라 스트림 중지
window.addEventListener('beforeunload', closeCamera);

 // 비디오 요소 자체에서 발생하는 오류 처리 (스트림 끊김 등)
 // cameraView가 null이 아닐 때만 이벤트 리스너 추가
 if (cameraView) {
      cameraView.addEventListener('error', (event) => {
          console.error('Video element error:', event);
           if (errorStatusElement) { errorStatusElement.textContent = '비디오 오류 발생'; errorStatusElement.className = 'status-error'; }
          closeCamera(); // 비디오 오류 발생 시 카메라 중지 시도
      });

      // 비디오 일시 정지/종료 이벤트
      cameraView.addEventListener('pause', () => { console.log('Video paused.'); });
      cameraView.addEventListener('ended', () => {
           console.log('Video ended.');
           closeCamera(); // 비디오가 자연스럽게 끝난 경우에도 중지
      });
 }
