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
var ctx = hiddenCanvas ? hiddenCanvas.getContext("2d") : null;

// 결과 팝업 관련 요소들
var resultPopupOverlay = document.getElementById("result-popup-overlay");
var resultPopupContent = document.getElementById("result-popup-content");
var popupTitleElement = document.getElementById("popup-title");
var popupMessageElement = document.getElementById("popup-message");
var matchedFaceImageElement = document.getElementById("matchedFaceImage");
var popupCloseButton = document.getElementById("popup-close-button");
var retryButton = document.getElementById("retry-button");

// 섹션 요소들
var singleMatchSection = document.getElementById("single-match-section");
var multipleMatchesSection = document.getElementById("multiple-matches-section");
var noMatchSection = document.getElementById("no-match-section");
var noMatchMessage = document.getElementById("no-match-message");
var candidateList = document.getElementById("candidate-list");

// 후보자 관련 요소
var confirmCandidateBtn;  // 동적으로 생성됨

// --- 상태 플래그 ---
// 현재 프레임 처리 (캡처, 전송, 응답 대기) 중인지
var isProcessing = false;
// 얼굴 비교 작업이 진행 중인지
var isComparingFace = false;
// 현재 선택된 후보자 ID
var selectedCandidateId = null;
// 캡처된 원본 이미지 데이터 (후보자 선택 시 얼굴 등록에 사용)
var capturedOriginalImage = null;

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

     // 캔버스 컨텍스트 유효성 재확인
    if (!ctx || !hiddenCanvas) {
        console.error("Canvas context or element is not available during capture.");
        isProcessing = false;
        if(errorStatusElement) {
             errorStatusElement.textContent = "오류: 캔버스 문제 발생.";
             errorStatusElement.className = 'status-error';
        }
        // 심각한 오류이므로 루프 중단
        isComparingFace = true;
        closeCamera();
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
    const imageData = hiddenCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

     // 얼굴 감지 API로 데이터 전송
    fetch('/api/detect-face', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageData })
    })
    .then(response => {
        // HTTP 오류 처리
        if (!response.ok) {
            console.error(`Detect API HTTP error! status: ${response.status}`);
             return response.json().then(errorData => {
                 console.error("Detect API Error Response:", errorData);
                 throw new Error(`Detect API HTTP error! status: ${response.status}, detail: ${errorData.detail || 'Unknown API Error'}`);
             }).catch(jsonError => {
                 console.error("Failed to parse Detect API error response or construct error:", jsonError);
                 throw new Error(`Detect API HTTP error! status: ${response.status}, ${response.statusText}`);
             });
        }
        return response.json();
    })
    .then(data => {
        // 얼굴 감지 API 응답 처리
        if(errorStatusElement) {
            errorStatusElement.textContent = '';
            errorStatusElement.className = '';
        }

        if (data && data.success === true) {
            if (data.face_detected === true && data.face_area) {
                // 얼굴 감지 성공 및 얼굴 영역 데이터 존재

                // 얼굴 크기 계산 (프레임 대비 얼굴 영역 비율)
                const frameArea = drawWidth * drawHeight;
                const faceArea = data.face_area.width * data.face_area.height;
                let currentFaceRatio = frameArea > 0 ? faceArea / frameArea : 0;

                // 비율을 퍼센트로 변환
                const ratioPercent = Math.round(currentFaceRatio * 100);

                // 얼굴 크기에 따라 상태 메시지 클래스 결정
                let ratioClass = 'face-ratio-low';
                let ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (작음)`;
                if (recognitionStatusElement) {
                    recognitionStatusElement.textContent = '얼굴을 더 가까이 비춰주세요.';
                    recognitionStatusElement.className = 'status-waiting';
                }

                if (currentFaceRatio >= MIN_FACE_RATIO) {
                    ratioClass = 'face-ratio-high';
                    ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (충분함)`;
                
                    if (recognitionStatusElement) {
                        recognitionStatusElement.textContent = '얼굴 크기 확인 완료. 인식 시작...';
                        recognitionStatusElement.className = 'status-success';
                    }
                
                    // 얼굴 영역 데이터 추출
                    const faceArea = data.face_area;
                    // 얼굴 영역 여백을 약간 추가하기 위해 20% 더 크게 추출
                    const margin = 0.2;
                    
                    // 여백을 추가한 얼굴 영역 계산
                    let faceX = Math.max(0, faceArea.x - faceArea.width * margin);
                    let faceY = Math.max(0, faceArea.y - faceArea.height * margin);
                    let faceWidth = Math.min(drawWidth - faceX, faceArea.width * (1 + margin * 2));
                    let faceHeight = Math.min(drawHeight - faceY, faceArea.height * (1 + margin * 2));
                    
                    // 얼굴 영역 추출을 위한 새 캔버스 생성
                    const faceCanvas = document.createElement('canvas');
                    const faceCtx = faceCanvas.getContext('2d');
                    
                    // 얼굴 영역 캔버스 크기 설정
                    faceCanvas.width = faceWidth;
                    faceCanvas.height = faceHeight;
                    
                    // 원본 이미지에서 얼굴 영역만 새 캔버스에 그림
                    faceCtx.drawImage(
                        hiddenCanvas, 
                        faceX, faceY, faceWidth, faceHeight,
                        0, 0, faceWidth, faceHeight
                    );
                    
                    // 압축 비율 적용
                    const compressCanvas = document.createElement('canvas');
                    const compressCtx = compressCanvas.getContext('2d');
                    compressCanvas.width = faceWidth * IMAGE_SCALE_FACTOR;
                    compressCanvas.height = faceHeight * IMAGE_SCALE_FACTOR;
                    
                    // 얼굴 이미지를 압축 캔버스에 그림
                    compressCtx.drawImage(
                        faceCanvas,
                        0, 0, faceWidth, faceHeight,
                        0, 0, compressCanvas.width, compressCanvas.height
                    );
                    
                    // 압축된 얼굴 이미지 데이터를 Base64 문자열로 변환
                    const faceImageData = compressCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    
                    // 원본 이미지 저장 (후보자 선택 시 얼굴 등록에 사용)
                    capturedOriginalImage = imageData;
                    
                    // 비교 시작
                    isComparingFace = true;
                    performFaceComparison(faceImageData, ratioPercent);
                } else if (currentFaceRatio >= MIN_FACE_RATIO * 0.7) {
                    ratioClass = 'face-ratio-medium';
                    ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (중간)`;
                    if (recognitionStatusElement) {
                        recognitionStatusElement.textContent = '조금 더 가까이 다가와주세요.';
                        recognitionStatusElement.className = 'status-waiting';
                    }
                } else {
                    ratioClass = 'face-ratio-low';
                    ratioMessage = `얼굴 크기: <span class="${ratioClass}">${ratioPercent}%</span> (매우 작음)`;
                    if (recognitionStatusElement) {
                        recognitionStatusElement.textContent = '얼굴을 카메라 중앙에 크게 비춰주세요.';
                        recognitionStatusElement.className = 'status-waiting';
                    }
                }

                // 얼굴 감지 상태 메시지 업데이트
                if (faceDetectionStatusElement) {
                    faceDetectionStatusElement.innerHTML = ratioMessage;
                    faceDetectionStatusElement.className = 'status-normal';
                }

            } else {
                // 얼굴 미감지 시
                if (faceDetectionStatusElement) {
                    faceDetectionStatusElement.textContent = '얼굴 크기: -';
                    faceDetectionStatusElement.className = 'status-normal';
                }
                if (recognitionStatusElement) {
                    recognitionStatusElement.textContent = '얼굴을 카메라에 비춰주세요...';
                    recognitionStatusElement.className = 'status-waiting';
                }
            }
        } else {
            // API 응답 실패 시
            console.error("Detect API returned success: false", data);
            if (faceDetectionStatusElement) {
                faceDetectionStatusElement.textContent = '얼굴 크기: -';
                faceDetectionStatusElement.className = 'status-normal';
            }
            if (recognitionStatusElement) {
                recognitionStatusElement.innerHTML = `감지 요청 실패: ${data?.message || '알 수 없는 오류'}`;
                recognitionStatusElement.className = 'status-error';
            }
        }
    })
    .catch(error => {
        // 얼굴 감지 API 요청 실패
        console.error("Detect API request failed:", error);
        if(errorStatusElement) {
            errorStatusElement.textContent = `감지 API 통신 오류: ${error.message}`;
            errorStatusElement.className = 'status-error';
        }
        if (faceDetectionStatusElement) {
            faceDetectionStatusElement.textContent = '얼굴 크기: -';
            faceDetectionStatusElement.className = 'status-normal';
        }
        if (recognitionStatusElement) {
            recognitionStatusElement.textContent = '얼굴을 카메라에 비춰주세요...';
            recognitionStatusElement.className = 'status-waiting';
        }
    })
    .finally(() => {
        isProcessing = false; // 프레임 처리 완료 플래그 해제

        // 비교 작업 중이 아니면 다음 프레임 예약
        if (!isComparingFace) {
            requestAnimationFrame(captureFrameAndSend);
        }
    });
}

// 얼굴 비교 API로 이미지 데이터를 전송하고 결과를 처리하는 함수
async function performFaceComparison(faceImageData, finalFaceRatioPercent) {
    if (recognitionStatusElement) {
        recognitionStatusElement.textContent = '얼굴 인식 중...';
        recognitionStatusElement.className = 'status-waiting';
    }
    if (errorStatusElement) {
        errorStatusElement.textContent = '';
        errorStatusElement.className = '';
    }

    console.log("Starting face comparison with API");

    try {
       const response = await fetch('/api/compare-face', {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json'
           },
           body: JSON.stringify({ 
               image: faceImageData
           })
       });

       if (!response.ok) {
           console.error(`Compare API HTTP error! status: ${response.status}`);
           const errorData = await response.json().catch(() => ({detail: response.statusText}));
           console.error("Compare API Error Response:", errorData);
           throw new Error(`Compare API HTTP error! status: ${response.status}, detail: ${errorData.detail || 'Unknown API Error'}`);
       }

       const data = await response.json();
       console.log("Compare API Response:", data);

       // 얼굴 비교 API 응답 처리
       if (data && data.success === true) {
           if (data.match_type === "high" && data.best_match) {
               // 높은 유사도 (0.7 이상) - 단일 사용자 표시
               handleHighConfidenceMatch(data.best_match);
           } else if (data.match_type === "medium" && Array.isArray(data.candidates) && data.candidates.length > 0) {
               // 중간 유사도 (0.5-0.7) - 후보자 목록 표시
               handleMediumConfidenceMatches(data.candidates);
           } else {
               // 낮은 유사도 (0.5 미만) - 인식 실패
               handleNoMatch("등록된 얼굴 중에 일치하는 얼굴을 찾지 못했습니다.");
           }
       } else {
           // API 응답 실패 시
           console.error("Compare API returned success: false", data);
           if (recognitionStatusElement) {
               recognitionStatusElement.innerHTML = `인식 요청 실패: ${data?.message || '알 수 없는 오류'}`;
               recognitionStatusElement.className = 'status-error';
           }
           handleNoMatch(`인식 요청 처리 중 오류가 발생했습니다: ${data?.message || '알 수 없는 오류'}`);
       }
    } catch (error) {
       console.error("Compare API request failed:", error);
       if(errorStatusElement) {
           errorStatusElement.textContent = `인식 API 통신 오류: ${error.message}`;
           errorStatusElement.className = 'status-error';
       }
       if (recognitionStatusElement) {
           recognitionStatusElement.textContent = '얼굴 인식 오류 발생';
           recognitionStatusElement.className = 'status-error';
       }
       handleNoMatch(`API 통신 중 오류가 발생했습니다: ${error.message}`);
    } finally {
       isComparingFace = false;
       isProcessing = false;
       // 카메라 스트림 종료
       closeCamera();
    }
}

// 높은 유사도(0.7 이상) 매치 처리
function handleHighConfidenceMatch(matchData) {
    if (recognitionStatusElement) { 
        recognitionStatusElement.textContent = `얼굴 인식 성공! (${matchData.name || '일치'}: ${Math.round(matchData.confidence * 100)}%)`;
        recognitionStatusElement.className = 'status-success'; 
    }

    // 결과 팝업 준비
    prepareResultPopup("얼굴 인식 성공");
    
    // 단일 매치 섹션 표시
    singleMatchSection.style.display = "block";
    multipleMatchesSection.style.display = "none";
    noMatchSection.style.display = "none";
    
    // 얼굴 이미지 설정
    if (matchData.image_base64) {
        matchedFaceImageElement.src = `data:image/jpeg;base64,${matchData.image_base64}`;
        matchedFaceImageElement.style.display = "block";
    } else {
        matchedFaceImageElement.style.display = "none";
    }
    
    // 메시지 업데이트
    popupMessageElement.innerHTML = `
        <p>인식된 사용자: <strong>${matchData.name || '알 수 없음'}</strong></p>
        <p>부서: <strong>${matchData.department || '-'}</strong></p>
        <p>직급: <strong>${matchData.position || '-'}</strong></p>
        <p>사번: <strong>${matchData.employeeId || '-'}</strong></p>
        <p>유사도: <strong>${Math.round(matchData.confidence * 100)}%</strong></p>
        <p class="confirmation-question">본인이 맞습니까?</p>
    `;
    
    // 버튼 이벤트 리스너 설정
    document.getElementById('confirmYesBtn').onclick = function() {
        handleAttendanceRegistration(matchData.name, false);
    };
    
    document.getElementById('confirmNoBtn').onclick = function() {
        handleIdentityDenial();
    };
    
    // 팝업 표시
    showResultPopup();
}

// 중간 유사도(0.5-0.7) 매치 처리 - 후보자 목록 표시
function handleMediumConfidenceMatches(candidates) {
    if (recognitionStatusElement) { 
        recognitionStatusElement.textContent = `유사한 얼굴 ${candidates.length}명 발견`;
        recognitionStatusElement.className = 'status-waiting'; 
    }

    // 결과 팝업 준비
    prepareResultPopup("유사한 얼굴 확인");
    
    // 다중 매치 섹션 표시
    singleMatchSection.style.display = "none";
    multipleMatchesSection.style.display = "block";
    noMatchSection.style.display = "none";
    
    // 후보자 목록 초기화
    candidateList.innerHTML = '';
    selectedCandidateId = null;
    
    // 후보자 목록 생성
    candidates.forEach(candidate => {
        const candidateCard = document.createElement('div');
        candidateCard.className = 'candidate-card';
        candidateCard.dataset.id = candidate.id;
        
        const img = document.createElement('img');
        img.className = 'candidate-image';
        img.src = candidate.image_base64 ? `data:image/jpeg;base64,${candidate.image_base64}` : '';
        img.alt = candidate.name || '후보자';
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'candidate-info';
        
        const nameP = document.createElement('p');
        nameP.className = 'candidate-name';
        nameP.textContent = candidate.name || '이름 없음';
        
        const detailsP = document.createElement('p');
        detailsP.className = 'candidate-details';
        detailsP.textContent = `${candidate.department || '-'} / ${candidate.position || '-'} / ${candidate.employeeId || '-'}`;
        
        const similaritySpan = document.createElement('span');
        similaritySpan.className = 'similarity-badge';
        similaritySpan.textContent = `유사도: ${Math.round(candidate.confidence * 100)}%`;
        
        infoDiv.appendChild(nameP);
        infoDiv.appendChild(detailsP);
        infoDiv.appendChild(similaritySpan);
        
        candidateCard.appendChild(img);
        candidateCard.appendChild(infoDiv);
        
        // 카드 클릭 이벤트 처리
        candidateCard.onclick = function() {
            // 이전 선택 항목의 선택 표시 제거
            document.querySelectorAll('.candidate-card').forEach(card => {
                card.classList.remove('selected');
            });
            // 현재 항목 선택 표시
            this.classList.add('selected');
            // 선택된 ID 저장
            selectedCandidateId = this.dataset.id;
            // 확인 버튼 활성화
            if (confirmCandidateBtn) {
                confirmCandidateBtn.disabled = false;
            }
        };
        
        candidateList.appendChild(candidateCard);
    });
    
    // 후보자 확인 버튼 추가
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'candidate-confirm';
    
    confirmCandidateBtn = document.createElement('button');
    confirmCandidateBtn.id = 'confirm-candidate-btn';
    confirmCandidateBtn.textContent = '선택한 사용자로 출석 등록';
    confirmCandidateBtn.disabled = true; // 초기에는 비활성화
    
    confirmCandidateBtn.onclick = function() {
        if (selectedCandidateId !== null) {
            const selectedCandidate = candidates.find(c => c.id == selectedCandidateId);
            if (selectedCandidate) {
                // 출석 등록 및 얼굴 추가 등록
                handleAttendanceRegistration(selectedCandidate.name, true);
            }
        }
    };
    
    buttonDiv.appendChild(confirmCandidateBtn);
    candidateList.appendChild(buttonDiv);
    
    // 팝업 표시
    showResultPopup();
}

// 매치 없음 처리
function handleNoMatch(message) {
    if (recognitionStatusElement) { 
        recognitionStatusElement.textContent = '일치하는 얼굴 없음';
        recognitionStatusElement.className = 'status-normal'; 
    }

    // 결과 팝업 준비
    prepareResultPopup("인식 실패");
    
    // 매치 없음 섹션 표시
    singleMatchSection.style.display = "none";
    multipleMatchesSection.style.display = "none";
    noMatchSection.style.display = "block";
    
    // 메시지 업데이트
    noMatchMessage.innerHTML = `
        <p>${message}</p>
        <p>얼굴 등록 페이지에서 먼저 등록해주세요.</p>
    `;
    
    // 팝업 표시
    showResultPopup();
}

// 출석 등록 처리
async function handleAttendanceRegistration(personName, registerNewFace) {
    try {
        const attendanceData = {
            name: personName
        };
        
        // 새 얼굴 등록이 필요한 경우
        if (registerNewFace && capturedOriginalImage) {
            attendanceData.image = capturedOriginalImage;
        }
        
        const response = await fetch('/api/register-attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(attendanceData)
        });
        
        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // 출석 등록 성공 메시지 표시
            showAttendanceSuccess(personName, data.date, data.time, data.tag, registerNewFace);
        } else {
            throw new Error(data.message || '출석 등록 실패');
        }
    } catch (error) {
        console.error("Attendance registration failed:", error);
        showAttendanceError(error.message);
    }
}

// 본인 부정 처리
function handleIdentityDenial() {
    // 단일 매치 섹션 숨기기
    singleMatchSection.style.display = "none";
    noMatchSection.style.display = "block";
    
    // 메시지 업데이트
    popupTitleElement.textContent = '얼굴 인식 실패';
    noMatchMessage.innerHTML = `
        <p>인식 정보가 정확하지 않습니다.</p>
        <p>관리자에게 문의하거나 얼굴 등록을 다시 해주세요.</p>
    `;

    initAfterResultPopup();
}

// 출석 등록 성공 표시
function showAttendanceSuccess(name, date, time, tag, newFaceRegistered) {
    // 모든 섹션 숨김
    singleMatchSection.style.display = "none";
    multipleMatchesSection.style.display = "none";
    noMatchSection.style.display = "block";
    
    let tagText = '';
    switch(tag) {
        case '출근': tagText = '<span style="color: #2ecc71;">출근</span>'; break;
        case '퇴근': tagText = '<span style="color: #3498db;">퇴근</span>'; break;
        case '지각': tagText = '<span style="color: #f39c12;">지각</span>'; break;
        case '외근': tagText = '<span style="color: #9b59b6;">외근</span>'; break;
        case '반차': tagText = '<span style="color: #2c3e50;">반차</span>'; break;
        default: tagText = '<span style="color: #7f8c8d;">기록 없음</span>';
    }
    
    // 메시지 업데이트
    noMatchMessage.innerHTML = `
        <p><strong>${name}</strong>님 환영합니다!</p>
        <p>출석이 성공적으로 기록되었습니다.</p>
        <p>날짜: ${date}</p>
        <p>시간: ${time}</p>
        <p>태그: ${tagText}</p>
        ${newFaceRegistered ? '<p style="margin-top:15px; color:#27ae60;"><strong>✓ 새로운 얼굴 이미지가 등록되었습니다.</strong></p>' : ''}
    `;
    
    // 팝업 제목 업데이트
    popupTitleElement.textContent = "출석 등록 완료";

    initAfterResultPopup();
}

// 출석 등록 오류 표시
function showAttendanceError(errorMessage) {
    // 모든 섹션 숨김
    singleMatchSection.style.display = "none";
    multipleMatchesSection.style.display = "none";
    noMatchSection.style.display = "block";
    
    // 메시지 업데이트
    noMatchMessage.innerHTML = `
        <p style="color: #e74c3c;">출석 등록 중 오류가 발생했습니다.</p>
        <p>${errorMessage}</p>
        <p>잠시 후 다시 시도하거나 관리자에게 문의하세요.</p>
    `;
    
    // 팝업 제목 업데이트
    popupTitleElement.textContent = "출석 등록 오류";
    
    initAfterResultPopup();
}

// 결과 팝업 준비
function prepareResultPopup(title) {
    // 팝업 제목 설정
    popupTitleElement.textContent = title;
}

// 결과 팝업 표시
function showResultPopup() {
    if (resultPopupOverlay) {
        resultPopupOverlay.classList.add('visible');
    } else {
        console.warn("Result popup overlay element not found");
    }
}

// 결과 팝업 숨기기
function hideResultPopup() {
    if (resultPopupOverlay) {
        resultPopupOverlay.classList.remove('visible');
        console.log("Result popup closed.");
    } else {
        console.warn("Result popup overlay element not found");
    }
}

function initAfterResultPopup() {
    setTimeout(() => {
        hideResultPopup();
        openCamera();
    }, 1500);
}

// 카메라 스트림 시작 및 비디오 재생
async function openCamera() {
    try {
        // 상태 메시지 초기화
        if (faceDetectionStatusElement) {
            faceDetectionStatusElement.textContent = "카메라 접근 요청 중...";
            faceDetectionStatusElement.className = 'status-waiting';
        }
        if (recognitionStatusElement) {
            recognitionStatusElement.textContent = '';
            recognitionStatusElement.className = '';
        }
        if (errorStatusElement) {
            errorStatusElement.textContent = '';
            errorStatusElement.className = '';
        }

        // 기존 스트림이 있으면 중지
        if (streamVideo) {
            const tracks = streamVideo.getTracks();
            tracks.forEach(track => track.stop());
        }
        streamVideo = null;
        if (cameraView) cameraView.srcObject = null;

        // 카메라 제약 조건 설정
        const constraints = {
            video: {
                facingMode: { ideal: "user" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        // 카메라 스트림 가져오기
        streamVideo = await navigator.mediaDevices.getUserMedia(constraints);
        if (cameraView) cameraView.srcObject = streamVideo;

        // 비디오 스트림 재생
        if (cameraView) {
            cameraView.play().then(() => {
                console.log("Video playback started.");

                // 비디오 메타데이터 로드 대기
                cameraView.onloadedmetadata = () => {
                    console.log("Video metadata loaded. Starting capture loop.");
                    if (faceDetectionStatusElement) {
                        faceDetectionStatusElement.textContent = "카메라 상태: 활성화됨.";
                        faceDetectionStatusElement.className = 'status-normal';
                    }
                    if (recognitionStatusElement) {
                        recognitionStatusElement.textContent = '얼굴을 카메라에 비춰주세요...';
                        recognitionStatusElement.className = 'status-waiting';
                    }
                    if (errorStatusElement) {
                        errorStatusElement.textContent = '';
                        errorStatusElement.className = '';
                    }

                    // 상태 플래그 초기화
                    isProcessing = false;
                    isComparingFace = false;

                    // 프레임 캡처 루프 시작
                    captureFrameAndSend();
                };
                
                // 메타데이터가 이미 로드된 경우
                if(cameraView.readyState >= 2) {
                    cameraView.onloadedmetadata();
                } else {
                    // 메타데이터 로드 이벤트가 발생하지 않을 경우의 안전 장치
                    console.warn("Video metadata not loaded yet, readyState:", cameraView.readyState);
                    if (faceDetectionStatusElement) {
                        faceDetectionStatusElement.textContent = "카메라 상태: 활성화됨. 메타데이터 로드 대기 중...";
                        faceDetectionStatusElement.className = 'status-waiting';
                    }
                    cameraView.addEventListener('loadedmetadata', cameraView.onloadedmetadata, { once: true });
                }
            }).catch(error => {
                console.error("비디오 재생 실패:", error);
                if (faceDetectionStatusElement) {
                    faceDetectionStatusElement.textContent = "오류: 비디오 재생 실패";
                    faceDetectionStatusElement.className = 'status-error';
                }
                if (recognitionStatusElement) {
                    recognitionStatusElement.textContent = error.message;
                    recognitionStatusElement.className = 'status-error';
                }
                if (errorStatusElement) {
                    errorStatusElement.textContent = '';
                    errorStatusElement.className = '';
                }
                alert("카메라 재생에 실패했습니다.");
                closeCamera();
            });
        } else {
            console.error("Camera view element is null, cannot play video.");
            if (errorStatusElement) {
                errorStatusElement.textContent = "오류: 비디오 요소 로드 실패.";
                errorStatusElement.className = 'status-error';
            }
        }
    } catch (error) {
        console.error("카메라 접근 오류:", error);
        if (faceDetectionStatusElement) {
            faceDetectionStatusElement.textContent = "오류: 카메라 접근 실패";
            faceDetectionStatusElement.className = 'status-error';
        }
        if (recognitionStatusElement) {
            recognitionStatusElement.textContent = '';
            recognitionStatusElement.className = '';
        }
        if (errorStatusElement) {
            errorStatusElement.textContent = error.message;
            errorStatusElement.className = 'status-error';
        }
        alert("카메라 접근에 실패했습니다: " + error.message);
    }
}

// 카메라 스트림 중지 함수
function closeCamera() {
    // 루프 중단 플래그 설정
    isComparingFace = true;

    if (streamVideo) {
        console.log("Stopping camera stream.");
        const tracks = streamVideo.getTracks();
        tracks.forEach(track => track.stop());
        streamVideo = null;
        if (cameraView) cameraView.srcObject = null;
        
        // 캔버스 클리어
        if(ctx && hiddenCanvas) {
            ctx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
        }
        
        // 비디오 요소의 크기 스타일 초기화
        if (cameraView) {
            cameraView.style.width = '';
            cameraView.style.height = '';
        }

        // 상태 메시지 업데이트
        if (faceDetectionStatusElement) {
            faceDetectionStatusElement.textContent = "카메라 상태: 종료됨";
            faceDetectionStatusElement.className = 'status-normal';
        }
    } else {
        console.log("Camera stream already stopped.");
        if (faceDetectionStatusElement) {
            faceDetectionStatusElement.textContent = "카메라 상태: 이미 종료됨";
            faceDetectionStatusElement.className = 'status-normal';
        }
    }

    // 플래그 초기화
    isComparingFace = false;
    isProcessing = false;
}

// 페이지 로드 시 초기화 및 카메라 자동 실행
function init() {
    console.log("Page initialized.");
    
    // 결과 팝업 닫기 버튼 이벤트 리스너 연결
    if (popupCloseButton) {
        popupCloseButton.addEventListener('click', hideResultPopup);
    }

    // 페이지 로드 시 자동으로 카메라 열기 시도
    openCamera();
}

// DOMContentLoaded 이벤트 발생 시 init 함수 호출
window.addEventListener('DOMContentLoaded', init);

// 페이지를 벗어나거나 닫을 때 카메라 스트림 중지
window.addEventListener('beforeunload', closeCamera);

// 비디오 요소 이벤트 처리
if (cameraView) {
    cameraView.addEventListener('error', (event) => {
        console.error('Video element error:', event);
        if (errorStatusElement) {
            errorStatusElement.textContent = '비디오 오류 발생';
            errorStatusElement.className = 'status-error';
        }
        closeCamera();
    });

    cameraView.addEventListener('pause', () => {
        console.log('Video paused.');
    });
    
    cameraView.addEventListener('ended', () => {
        console.log('Video ended.');
        closeCamera();
    });
}