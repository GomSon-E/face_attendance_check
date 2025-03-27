import cv2
import os
import time
from datetime import datetime

def face_detection_and_capture():
    # 저장할 디렉토리 생성
    save_dir = "captured_faces"
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    # 얼굴 감지기 로드
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    # 웹캠 연결
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
    
    # 이미지 저장 간격 (초)
    capture_cooldown = 2
    last_capture_time = time.time() - capture_cooldown
    
    while True:
        # 프레임 읽기
        ret, frame = cap.read()
        
        # 프레임을 읽지 못했다면
        if not ret:
            print("프레임을 읽을 수 없습니다.")
            break
        
        # 프레임을 그레이스케일로 변환 (얼굴 감지 성능 향상)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 얼굴 감지
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        current_time = time.time()
        capture_ready = current_time - last_capture_time > capture_cooldown
        
        # 감지된 얼굴에 사각형 표시
        for (x, y, w, h) in faces:
            # 얼굴 영역 면적
            face_area = w * h
            face_ratio = face_area / frame_area
            
            # 얼굴 주위에 사각형 그리기
            color = (0, 255, 0)  # 녹색
            thickness = 2
            cv2.rectangle(frame, (x, y), (x+w, y+h), color, thickness)
            
            # 얼굴 비율 텍스트 표시
            ratio_text = f"Face ratio: {face_ratio:.2%}"
            cv2.putText(frame, ratio_text, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, thickness)
            
            # 일정 크기 이상이고 쿨다운 시간이 지났다면 이미지 저장
            if face_ratio > min_face_ratio and capture_ready:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = os.path.join(save_dir, f"face_{timestamp}.jpg")
                cv2.imwrite(filename, frame)
                print(f"얼굴 이미지가 저장되었습니다: {filename}")
                last_capture_time = current_time
                
                # 저장 표시
                cv2.putText(frame, "Saved!", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        # 화면에 프레임 표시
        cv2.imshow('Face Detection', frame)
        
        # 'q' 키를 누르면 종료
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    # 자원 해제
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    face_detection_and_capture()