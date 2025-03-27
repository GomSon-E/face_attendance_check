import cv2
import time

def capture_webcam():
    # 웹캠 연결 (0은 기본 웹캠)
    cap = cv2.VideoCapture(0)
    
    # 웹캠이 정상적으로 열렸는지 확인
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다.")
        return
    
    print("웹캠이 활성화되었습니다. 'q'를 누르면 종료됩니다.")
    
    while True:
        # 프레임 읽기
        ret, frame = cap.read()
        
        # 프레임을 읽지 못했다면
        if not ret:
            print("프레임을 읽을 수 없습니다.")
            break
        
        # 화면에 프레임 표시
        cv2.imshow('Webcam', frame)
        
        # 'q' 키를 누르면 종료
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    # 자원 해제
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    capture_webcam()