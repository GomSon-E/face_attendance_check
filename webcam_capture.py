import cv2
import os
import time
import numpy as np
from datetime import datetime

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

def find_similar_face(target_image_path, known_faces_dir, model_name="ArcFace", distance_metric="euclidean"):
    """
    주어진 대상 이미지와 가장 유사한 얼굴을 찾습니다.
    
    매개변수:
    target_image_path (str): 대상 이미지 경로
    known_faces_dir (str): 알려진 얼굴 이미지가 있는 디렉토리 경로
    model_name (str): 사용할 얼굴 인식 모델 - TF 2.19 호환 모델만 사용
                     ('Facenet', 'OpenFace', 'ArcFace', 'Dlib')
    distance_metric (str): 사용할 거리 측정 방법 (cosine, euclidean, euclidean_l2)
    
    반환:
    dict: 가장 유사한 얼굴 정보 (이미지 경로, 유사도 등)
    """
    print(f"대상 이미지: {target_image_path}")
    print(f"데이터베이스 디렉토리: {known_faces_dir}")
    print(f"사용 모델: {model_name}, 거리 측정법: {distance_metric}")
    
    # TF 2.19 호환성 확인
    incompatible_models = ["DeepFace", "DeepID", "VGG-Face"]
    if model_name in incompatible_models:
        print(f"경고: {model_name} 모델은 TensorFlow 2.12 이후에서 호환되지 않습니다.")
        print("Facenet 모델로 대체합니다.")
        model_name = "Facenet"
    
    # 디렉토리에서 이미지 파일 찾기
    known_face_paths = []
    for filename in os.listdir(known_faces_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            known_face_paths.append(os.path.join(known_faces_dir, filename))
    
    if len(known_face_paths) == 0:
        raise ValueError(f"지정된 디렉토리 {known_faces_dir}에 이미지 파일이 없습니다.")
    
    print(f"비교할 이미지 {len(known_face_paths)}개 발견")
    
    # 결과를 저장할 리스트
    results = []
    
    # 각 이미지와 비교
    for face_path in known_face_paths:
        try:
            # DeepFace로 두 이미지 비교
            result = DeepFace.verify(
                img1_path=target_image_path,
                img2_path=face_path,
                model_name=model_name,
                distance_metric=distance_metric,
                detector_backend="mtcnn",
                enforce_detection=False
            )
            
            # 결과 저장
            results.append({
                'face_path': face_path,
                'distance': result['distance'],
                'verified': result['verified'],
                'model': model_name,
                'metric': distance_metric
            })
            
            print(f"비교 결과 - {os.path.basename(face_path)}: 거리 = {result['distance']:.4f}, 일치 = {result['verified']}")
            
        except Exception as e:
            print(f"이미지 {face_path} 비교 중 오류: {str(e)}")
    
    # 결과가 없으면
    if len(results) == 0:
        return None
    
    # 거리가 가장 짧은 결과 선택 (가장 유사한 얼굴)
    best_match = min(results, key=lambda x: x['distance'])
    
    print("\n가장 유사한 얼굴:")
    print(f"파일: {os.path.basename(best_match['face_path'])}")
    print(f"거리: {best_match['distance']:.4f}")
    print(f"일치 여부: {best_match['verified']}")
    
    return best_match

def face_detection_and_capture():
    # 저장할 디렉토리 생성
    save_dir = "captured_faces"
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    # 비교할 얼굴 데이터베이스 디렉토리
    database_dir = "data_faces"
    if not os.path.exists(database_dir):
        print(f"경고: 얼굴 데이터베이스 디렉토리 {database_dir}가 존재하지 않습니다.")
    
    # 웹캠 연결
    print("웹캠 연결 중...")
    cap = cv2.VideoCapture(0)
    
    # 웹캠이 정상적으로 열렸는지 확인
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다.")
        return
    
    # 웹캠 해상도 설정 (예: HD 해상도)
    # cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    # cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    
    # 설정된 웹캠 해상도 확인
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_area = frame_width * frame_height
    
    print(f"웹캠 해상도: {frame_width}x{frame_height}")
    print("얼굴 감지 모드가 활성화되었습니다. 'q'를 누르면 종료됩니다.")
    
    # 최소 얼굴 크기 비율 설정 (전체 프레임 대비)
    min_face_ratio = 0.20  # 20%
    
    # 이미지를 한 번만 저장하기 위한 플래그
    image_captured = False
    saved_image_path = None
    
    # 모델 및 백엔드 설정 - TF 2.19 호환 모델 사용
    detector_backend = "mtcnn"  # 'opencv', 'mtcnn', 'retinaface', 'ssd' 중 선택
    face_model = "Facenet"  # 'Facenet', 'OpenFace', 'ArcFace', 'Dlib' 중 선택
    
    while True:
        # 프레임 읽기
        ret, frame = cap.read()
        
        # 이미지 향상 적용 (밝기 및 대비 조정)
        display_frame = cv2.convertScaleAbs(frame, alpha=1.5, beta=30)
        
        # 이미 이미지가 캡처되었는지 확인
        capture_ready = not image_captured
        
        # 얼굴 감지 및 이미지 저장 처리
        try:
            if capture_ready:
                # DeepFace로 얼굴 감지 (향상된 이미지 사용)
                faces = DeepFace.extract_faces(
                    img_path=display_frame,
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
                            filename = f"face_{timestamp}.jpg"
                            saved_image_path = os.path.join(save_dir, filename)
                            
                            # 향상된 이미지 저장
                            cv2.imwrite(saved_image_path, display_frame)
                                
                            print(f"얼굴 이미지가 저장되었습니다: {saved_image_path}")
                            image_captured = True
                            
                            # 저장 표시
                            cv2.putText(display_frame, "Saved! Looking for matches...", (10, 90), 
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
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        cv2.imshow('Face Detection (DeepFace)', display_frame)
        
        # 'q' 키를 누르면 종료
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("'q' 키가 눌렸습니다. 종료합니다.")
            break
        
        # 이미지가 캡처되었고 아직 비교를 수행하지 않았다면 비교 수행
        if image_captured and saved_image_path is not None:
            try:
                # 웹캠 화면을 유지하면서 비교 수행
                print("\n유사한 얼굴 검색 중...")
                
                best_match = find_similar_face(
                    saved_image_path, 
                    database_dir, 
                    model_name=face_model
                )
                
                # 결과 표시
                if best_match:
                    pass
                else:
                    print("유사한 얼굴을 찾을 수 없습니다.")
                
                # 비교 완료 표시 (두 번 이상 비교하지 않도록)
                saved_image_path = None
                
            except Exception as e:
                print(f"얼굴 비교 중 오류 발생: {str(e)}")
                saved_image_path = None  # 오류 발생 시에도 재시도 방지
    
    # 자원 해제
    cap.release()
    cv2.destroyAllWindows()
    print("프로그램이 종료되었습니다.")

if __name__ == "__main__":
    print("프로그램 시작...")
    face_detection_and_capture()