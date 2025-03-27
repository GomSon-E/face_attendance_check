import cv2
import os
import time
from datetime import datetime
import numpy as np

# TensorFlow 로그 레벨 설정
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # 정보성 메시지 숨기기

# 필요한 패키지 먼저 import
print("라이브러리 로딩 중...")
try:
    from deepface import DeepFace
    print("DeepFace 로딩 성공")
except Exception as e:
    print(f"DeepFace 로딩 실패: {e}")
    exit(1)

def face_detection_and_capture():
    # 저장할 디렉토리 생성
    save_dir = "captured_faces"
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    # 웹캠 연결
    print("웹캠 연결 중...")
    cap = cv2.VideoCapture(0)
    
    # 웹캠이 정상적으로 열렸는지 확인
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다.")
        return
    
    # 웹캠 해상도 확인
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_area = frame_width * frame_height
    
    print(f"웹캠 해상도: {frame_width}x{frame_height}")
    print("얼굴 감지 모드가 활성화되었습니다. 'q'를 누르면 종료됩니다.")
    
    # 최소 얼굴 크기 비율 설정 (전체 프레임 대비)
    min_face_ratio = 0.20  # 20%
    
    # 이미지를 한 번만 저장하기 위한 플래그
    image_captured = False
    
    # 모델 및 백엔드 설정
    detector_backend = "mtcnn"  # 'opencv', 'mtcnn', 'retinaface', 'ssd' 중 선택
    
    while True:
        # 프레임 읽기
        ret, frame = cap.read()
        
        # 프레임을 읽지 못했다면
        if not ret:
            print("프레임을 읽을 수 없습니다.")
            break
        
        display_frame = frame.copy()
        
        # 이미 이미지가 캡처되었는지 확인
        capture_ready = not image_captured
        
        # 얼굴 감지 및 이미지 저장 처리
        try:
            if capture_ready:
                # DeepFace로 얼굴 감지
                faces = DeepFace.extract_faces(
                    img_path=frame,
                    detector_backend=detector_backend,
                    enforce_detection=False
                )
                
                # 얼굴이 감지되었는지 확인
                if len(faces) == 0:
                    cv2.putText(display_frame, "No faces detected", (10, 30), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                else:
                    # 유효한 얼굴 찾기
                    valid_face_found = False
                    max_face_ratio = 0
                    max_face_area = None
                    
                    for face in faces:
                        # 얼굴 정보 추출
                        if "facial_area" not in face:
                            continue
                            
                        facial_area = face["facial_area"]
                        if not all(key in facial_area for key in ['x', 'y', 'w', 'h']):
                            continue
                        
                        x = facial_area['x']
                        y = facial_area['y']
                        w = facial_area['w']
                        h = facial_area['h']
                        
                        # 얼굴 영역이 너무 작거나 이상한 경우 필터링
                        if w <= 10 or h <= 10 or w > frame_width*0.9 or h > frame_height*0.9:
                            continue
                        
                        # 얼굴 영역 면적
                        face_area = w * h
                        face_ratio = face_area / frame_area
                        
                        # 가장 큰 얼굴 찾기
                        if face_ratio > max_face_ratio:
                            max_face_ratio = face_ratio
                            max_face_area = (x, y, w, h)
                        
                        valid_face_found = True

                        print(face)
                    
                    # 유효한 얼굴이 있으면 표시
                    if valid_face_found and max_face_area is not None:
                        x, y, w, h = max_face_area
                        
                        # 얼굴 주위에 사각형 그리기
                        color = (0, 255, 0)  # 녹색
                        thickness = 2
                        cv2.rectangle(display_frame, (x, y), (x+w, y+h), color, thickness)
                        
                        # 얼굴 비율 텍스트 표시
                        ratio_text = f"Face ratio: {max_face_ratio:.2%}"
                        cv2.putText(display_frame, ratio_text, (x, y-10), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, thickness)
                        
                        # 일정 크기 이상이면 이미지 저장
                        if max_face_ratio > min_face_ratio:
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            filename = os.path.join(save_dir, f"face_{timestamp}.jpg")
                            cv2.imwrite(filename, frame)
                            print(f"얼굴 이미지가 저장되었습니다: {filename}")
                            image_captured = True
                            
                            # 저장 표시
                            cv2.putText(display_frame, "Saved!", (10, 90), 
                                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    else:
                        cv2.putText(display_frame, "No valid face detected", (10, 30), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            
        except Exception as e:
            print(f"얼굴 감지 중 오류 발생: {e}")
            # 오류 메시지 화면에 표시
            cv2.putText(display_frame, f"Error: {str(e)[:50]}", (10, 30), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        
        # 이미 캡처된 경우 메시지 표시
        if image_captured:
            cv2.putText(display_frame, "Image captured", (10, 30), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        # 화면에 프레임 표시
        cv2.putText(display_frame, "Press 'q' to quit", (10, frame_height - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        cv2.imshow('Face Detection (DeepFace)', display_frame)
        
        # 'q' 키를 누르면 종료
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("'q' 키가 눌렸습니다. 종료합니다.")
            break
    
    # 자원 해제
    cap.release()
    cv2.destroyAllWindows()
    print("프로그램이 종료되었습니다.")

if __name__ == "__main__":
    print("프로그램 시작...")
    face_detection_and_capture()