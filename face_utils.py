# face_utils.py - 얼굴 처리 관련 유틸리티
import os
import cv2
import numpy as np
import pandas as pd
import base64
from datetime import datetime
from fastapi import HTTPException
import mediapipe as mp
from typing import Dict, Any, List

# 자체 모듈 임포트
from config import DATA_DIR, FACE_MODEL, DETECTOR_BACKEND, create_path
from utils import (
    sanitize_filename, 
    get_or_create_employee, 
    save_face_encoding, 
    get_employee_info, 
    get_all_face_encodings_with_employee_info, 
    delete_face_encoding, 
    record_attendance
)

# DeepFace 로드
try:
    from deepface import DeepFace
except Exception as e:
    print(f"DeepFace 로딩 실패: {e}")
    exit(1)

# MediaPipe Face Mesh 초기화
try:
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    MEDIAPIPE_AVAILABLE = True
    print("MediaPipe Face Mesh initialized successfully")
except Exception as e:
    print(f"Warning: MediaPipe not available: {e}. Using basic face detection.")
    MEDIAPIPE_AVAILABLE = False

def process_face_image(name, image_data, metadata=None):
    """얼굴 이미지 처리 및 특징 벡터 추출"""
    # 이미지 저장 경로 지정 - 슬래시 사용
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S.%f")[:-3]
    safe_name = sanitize_filename(name)  # 한글 이름 문제 해결
    image_filename = f"{safe_name}_{timestamp}.jpg"
    image_path = create_path(DATA_DIR, image_filename)  # 슬래시 경로 사용
    
    # Base64 이미지 데이터 디코딩
    try:
        # Base64 접두사 제거 (있는 경우)
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
            
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="이미지 데이터를 디코딩할 수 없습니다.")
    except Exception as e:
        print(f"이미지 디코딩 중 오류: {str(e)}")
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 중 오류: {str(e)}")
    
    # 폴더 존재 확인 및 생성
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # 이미지 저장
    print(f"이미지 저장 시도: 형식={img.shape}, 타입={img.dtype}")
    success = cv2.imwrite(image_path, img)
    print(f"이미지 저장 결과: {success}")
    
    # 저장 후 확인
    if not os.path.exists(image_path):
        print(f"저장 실패: 파일이 존재하지 않음 - {image_path}")
        
        # 다른 방식으로 저장 시도
        with open(image_path, 'wb') as f:
            f.write(image_bytes)
        print(f"대체 방식으로 저장 시도 후 확인: {os.path.exists(image_path)}")
        
        if not os.path.exists(image_path):
            raise HTTPException(status_code=500, detail="이미지 파일을 저장하지 못했습니다.")
    else:
        file_size = os.path.getsize(image_path)
        print(f"저장 성공: 파일 크기 {file_size} 바이트")
        
        if file_size == 0:
            os.remove(image_path)  # 빈 파일 삭제
            raise HTTPException(status_code=500, detail="이미지 파일이 빈 파일로 저장되었습니다.")
    
    # 얼굴 감지 및 특징 벡터 추출
    try:
        # DeepFace로 얼굴 임베딩(특징 벡터) 추출
        embedding_obj = DeepFace.represent(
            img_path=image_path,
            model_name=FACE_MODEL,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False
        )
        
        if not embedding_obj or len(embedding_obj) == 0:
            raise HTTPException(status_code=400, detail="이미지에서 얼굴을 감지할 수 없습니다.")
        
        # 첫 번째 얼굴의 임베딩 벡터 추출
        embedding_vector = embedding_obj[0]["embedding"]
        
        # CSV에 저장
        # 1단계: 직원 정보 생성/업데이트
        department = metadata.get("department", "") if metadata else ""
        position = metadata.get("position", "") if metadata else ""
        employeeId = metadata.get("employeeId", "") if metadata else ""
        
        employee_id = get_or_create_employee(name, department, position, employeeId)
        if employee_id is None:
            raise HTTPException(status_code=500, detail="직원 정보 처리에 실패했습니다.")
        
        # 2단계: 얼굴 벡터 저장
        encoding_id = save_face_encoding(employee_id, image_path, np.array(embedding_vector))
        if encoding_id is None:
            raise HTTPException(status_code=500, detail="얼굴 벡터를 저장하지 못했습니다.")
        
        # 이미지를 Base64로 인코딩하여 응답
        _, buffer = cv2.imencode('.jpg', img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        employee_info = get_employee_info(employee_id=employee_id)
    
        return {
            "success": True,
            "message": f"{name}의 얼굴 특징 벡터가 성공적으로 추출되어 저장되었습니다.",
            "employee_id": employee_id,
            "encoding_id": encoding_id,
            "name": name,
            "department": employee_info.get('department', ''),
            "position": employee_info.get('position', ''),
            "employeeId": employee_info.get('employeeId', ''),
            "image_path": image_path,
            "vector_length": len(embedding_vector),
            "image_base64": img_base64
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"특징 벡터 추출 중 오류: {str(e)}\n{traceback_str}")
        
        # 저장된 이미지 삭제 (오류 발생 시)
        if os.path.exists(image_path):
            os.remove(image_path)
            print(f"오류로 인해 이미지 파일 삭제: {image_path}")
            
        raise HTTPException(status_code=500, detail=f"특징 벡터 추출 중 오류: {str(e)}")

def get_all_faces():
    """저장된 모든 얼굴 데이터 목록 반환"""
    face_encodings = get_all_face_encodings_with_employee_info()
    faces = []
    
    for encoding_data in face_encodings:
        image_path = encoding_data['image_path']
        if os.path.exists(image_path):
            img = cv2.imread(image_path)
            if img is not None:
                _, buffer = cv2.imencode('.jpg', img)
                img_base64 = base64.b64encode(buffer).decode('utf-8')
                
                faces.append({
                    "id": encoding_data['encoding_id'],          
                    "employee_id": encoding_data['employee_id'],
                    "name": encoding_data['name'],
                    "department": encoding_data['department'], 
                    "position": encoding_data['position'], 
                    "employeeId": encoding_data['employeeId'], 
                    "image_path": image_path,
                    "image_base64": img_base64
                })
    
    return faces

def delete_face_data(face_id):
    """특정 얼굴 데이터 삭제"""
    result = delete_face_encoding(face_id)  # encoding_id 기반으로 삭제
    
    if result:
        return {"success": True, "message": "얼굴 데이터가 성공적으로 삭제되었습니다."}
    else:
        raise HTTPException(status_code=404, detail="해당 ID의 얼굴 데이터를 찾을 수 없습니다.")
    
def calculate_similarity(vector1: np.ndarray, vector2: np.ndarray) -> float:
    """두 벡터 간의 코사인 유사도 계산"""
    try:
        # 벡터를 1차원으로 변환 (필요하다면)
        v1 = vector1.flatten()
        v2 = vector2.flatten()

        # 두 벡터의 내적 계산
        dot_product = np.dot(v1, v2)

        # 각 벡터의 유클리드 노름(크기) 계산
        norm_v1 = np.linalg.norm(v1)
        norm_v2 = np.linalg.norm(v2)

        # 노름이 0인 경우 (영벡터) 처리
        if norm_v1 == 0 or norm_v2 == 0:
            return 0.0

        # 코사인 유사도 계산: 내적 / (v1 크기 * v2 크기)
        similarity = dot_product / (norm_v1 * norm_v2)

        # 결과가 [ -1, 1 ] 범위를 벗어나는 미세한 부동소수점 오류 방지
        similarity = np.clip(similarity, -1.0, 1.0)

        return float(similarity)

    except Exception as e:
        print(f"코사인 유사도 계산 중 오류: {str(e)}")
        return 0.0 # 오류 발생 시 기본값 반환

def validate_facial_features_with_mediapipe(img, face_region):
    """
    MediaPipe를 사용하여 얼굴의 주요 특징(눈, 코, 입)이 모두 존재하는지 검증
    """
    if not MEDIAPIPE_AVAILABLE:
        return True  # MediaPipe가 없으면 기본 검증을 통과시킴
    
    try:
        # 얼굴 영역 추출
        x, y, w, h = face_region['x'], face_region['y'], face_region['w'], face_region['h']
        
        # 원본 이미지에서 얼굴 영역만 잘라내기
        face_img = img[y:y+h, x:x+w]
        
        if face_img.size == 0:
            return False
        
        # MediaPipe로 얼굴 메시 감지
        results = face_mesh.process(face_img)
        
        if not results.multi_face_landmarks:
            print("No face landmarks detected by MediaPipe")
            return False
        
        # 첫 번째 얼굴의 landmarks 사용
        face_landmarks = results.multi_face_landmarks[0]
        
        # MediaPipe의 공식 랜드마크 상수들 사용
        # 이미지 크기
        h_img, w_img = face_img.shape[:2]
        
        # 각 특징 영역의 포인트들을 추출하고 검증
        def extract_and_validate_feature_by_connections(connections, feature_name, min_unique_points=8):
            """
            MediaPipe의 connection 정보를 사용하여 특징 포인트들을 추출하고 검증
            """
            try:
                # connection에서 고유한 포인트 인덱스들을 추출
                unique_indices = set()
                for connection in connections:
                    unique_indices.add(connection[0])
                    unique_indices.add(connection[1])
                
                valid_points = []
                for idx in unique_indices:
                    if idx < len(face_landmarks.landmark):
                        landmark = face_landmarks.landmark[idx]
                        # 정규화된 좌표를 픽셀 좌표로 변환
                        x_pixel = int(landmark.x * w_img)
                        y_pixel = int(landmark.y * h_img)
                        
                        # 유효한 범위 내의 포인트만 추가
                        if 0 <= x_pixel < w_img and 0 <= y_pixel < h_img:
                            valid_points.append([x_pixel, y_pixel])
                
                if len(valid_points) < min_unique_points:
                    print(f"{feature_name}: insufficient points ({len(valid_points)}/{min_unique_points})")
                    return False, []
                
                valid_points = np.array(valid_points)
                
                # 포인트들이 최소한의 영역을 차지하는지 확인 (너무 뭉쳐있지 않은지)
                if len(valid_points) >= 3:
                    # 포인트들의 경계 박스 계산
                    min_x, min_y = np.min(valid_points, axis=0)
                    max_x, max_y = np.max(valid_points, axis=0)
                    area = (max_x - min_x) * (max_y - min_y)
                    
                    # 특징이 최소한의 크기를 가져야 함
                    min_area = (w_img * h_img) * 0.005
                    if area < min_area:
                        print(f"{feature_name}: area too small ({area:.2f} < {min_area:.2f})")
                        return False, valid_points
                    
                    std_x = np.std(valid_points[:, 0])
                    std_y = np.std(valid_points[:, 1])
                    if std_x < 3 or std_y < 3:  # 포인트들이 너무 뭉쳐있으면 거부
                        print(f"{feature_name}: points too clustered (std_x: {std_x:.2f}, std_y: {std_y:.2f})")
                        return False, valid_points
                
                print(f"{feature_name}: valid ({len(valid_points)} points, area: {area:.2f})")
                return True, valid_points
                
            except Exception as e:
                print(f"Error validating {feature_name}: {e}")
                return False, []
        
        # MediaPipe의 공식 connection 상수들을 사용하여 각 특징 검증
        left_eye_valid, left_eye_points = extract_and_validate_feature_by_connections(
            mp_face_mesh.FACEMESH_LEFT_EYE, "Left eye", 12
        )
        
        right_eye_valid, right_eye_points = extract_and_validate_feature_by_connections(
            mp_face_mesh.FACEMESH_RIGHT_EYE, "Right eye", 12
        )
        
        nose_valid, nose_points = extract_and_validate_feature_by_connections(
            mp_face_mesh.FACEMESH_NOSE, "Nose", 16
        )
        
        mouth_valid, mouth_points = extract_and_validate_feature_by_connections(
            mp_face_mesh.FACEMESH_LIPS, "Mouth", 40
        )
        
        # 모든 주요 특징이 감지되어야만 유효한 얼굴로 인정
        all_features_valid = left_eye_valid and right_eye_valid and nose_valid and mouth_valid
        
        if not all_features_valid:
            print(f"Feature validation FAILED - Left eye: {left_eye_valid}, Right eye: {right_eye_valid}, Nose: {nose_valid}, Mouth: {mouth_valid}")
            return False
        
        # 추가 검증: 특징들의 상대적 위치가 자연스러운지 확인
        if (len(left_eye_points) > 0 and len(right_eye_points) > 0 and 
            len(nose_points) > 0 and len(mouth_points) > 0):
            
            left_eye_center = np.mean(left_eye_points, axis=0)
            right_eye_center = np.mean(right_eye_points, axis=0)
            nose_center = np.mean(nose_points, axis=0)
            mouth_center = np.mean(mouth_points, axis=0)
            
            # 눈 사이의 거리
            eye_distance = np.linalg.norm(left_eye_center - right_eye_center)
            
            # 코가 두 눈 사이에 적절히 위치하는지 확인
            eye_midpoint = (left_eye_center + right_eye_center) / 2
            nose_to_eye_horizontal_distance = abs(nose_center[0] - eye_midpoint[0])
            
            # 입이 코보다 아래에 위치하는지 확인
            nose_mouth_vertical_distance = mouth_center[1] - nose_center[1]
            
            # 비율 기반 검증
            face_width = w_img
            face_height = h_img
            
            # 검증 조건들
            valid_eye_distance = eye_distance > face_width * 0.15  # 눈 사이 거리가 얼굴 너비의 15% 이상
            valid_nose_position = nose_to_eye_horizontal_distance < eye_distance * 0.4  # 코가 눈 중앙에서 크게 벗어나지 않음
            valid_mouth_position = nose_mouth_vertical_distance > face_height * 0.05  # 입이 코보다 아래 위치
            
            position_valid = valid_eye_distance and valid_nose_position and valid_mouth_position
            
            if not position_valid:
                print(f"Position validation FAILED - Eye distance: {valid_eye_distance} ({eye_distance:.1f}/{face_width * 0.15:.1f}), "
                      f"Nose position: {valid_nose_position} ({nose_to_eye_horizontal_distance:.1f}/{eye_distance * 0.4:.1f}), "
                      f"Mouth position: {valid_mouth_position} ({nose_mouth_vertical_distance:.1f}/{face_height * 0.05:.1f})")
                return False
        
        print("All facial features validated successfully with MediaPipe")
        return True
        
    except Exception as e:
        print(f"Error in MediaPipe facial feature validation: {str(e)}")
        return False

def detect_face(image_data: str) -> Dict[str, Any]:
    """이미지에서 얼굴 감지 (MediaPipe 기반 완전한 특징 검증 포함)"""
    try:
        # Base64 이미지 데이터 디코딩
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
            
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="이미지 데이터를 디코딩할 수 없습니다.")
        
        # 이미지 향상 적용 (밝기 및 대비 조정)
        enhanced_img = cv2.convertScaleAbs(img, alpha=1.5, beta=30)
        
        # DeepFace로 얼굴 감지
        faces = DeepFace.extract_faces(
            img_path=enhanced_img,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False
        )
        
        # 얼굴이 감지되었는지 확인
        if not faces or len(faces) == 0:
            return {
                "success": True,
                "face_detected": False,
                "message": "얼굴이 감지되지 않았습니다."
            }
        
        # 유효한 얼굴 찾기 (MediaPipe로 엄격한 특징 검증)
        valid_faces = []
        frame_area = img.shape[0] * img.shape[1]  # 전체 프레임 면적
        
        for face in faces:
            if "facial_area" in face:
                facial_area = face["facial_area"]
                if all(key in facial_area for key in ['x', 'y', 'w', 'h']):
                    # 얼굴 영역이 너무 작거나 이상한 경우 필터링
                    x, y, w, h = facial_area['x'], facial_area['y'], facial_area['w'], facial_area['h']
                    if w <= 10 or h <= 10 or w > img.shape[1]*0.9 or h > img.shape[0]*0.9:
                        continue
                    
                    # MediaPipe로 얼굴 특징 검증
                    if not validate_facial_features_with_mediapipe(img, facial_area):
                        print("Face REJECTED: MediaPipe validation failed - missing complete facial features (eyes, nose, mouth)")
                        continue
                    
                    # 얼굴 영역 면적과 비율 계산
                    face_area = w * h
                    face_ratio = face_area / frame_area
                    
                    # 신뢰도 점수가 있으면 사용, 없으면 기본값 0 사용
                    confidence = face.get("confidence", 0)
                    
                    valid_faces.append({
                        "facial_area": facial_area,
                        "face_ratio": face_ratio,
                        "confidence": confidence
                    })

                    global timestamp_face_detect_end
                    timestamp_face_detect_end = datetime.now()
                    print('Timestamp - Face Detect End:', timestamp_face_detect_end)
        
        # 유효한 얼굴이 없는 경우
        if not valid_faces:
            return {
                "success": True,
                "face_detected": False,
                "message": "완전한 얼굴이 감지되지 않았습니다. 눈, 코, 입이 모두 명확하게 보이도록 얼굴을 정면으로 향하게 해주세요."
            }
        
        # 가장 큰 얼굴 선택
        largest_face = max(valid_faces, key=lambda face: face["face_ratio"])
        facial_area = largest_face["facial_area"]
        
        return {
            "success": True,
            "face_detected": True,
            "face_area": {
                "x": facial_area["x"],
                "y": facial_area["y"],
                "width": facial_area["w"],
                "height": facial_area["h"]
            },
            "face_ratio": largest_face["face_ratio"],
            "confidence": largest_face["confidence"]
        }
    
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 감지 중 오류: {str(e)}\n{traceback_str}")
        return {
            "success": False,
            "face_detected": False,
            "message": f"얼굴 감지 중 오류: {str(e)}"
        }

def compare_face(image_data: str) -> Dict[str, Any]:
    """촬영된 얼굴과 등록된 얼굴들 비교"""

    global timestamp_face_compare_start
    timestamp_face_compare_start = datetime.now()
    print('Timestamp - Face Compare Start:', timestamp_face_compare_start)
    time_diff = timestamp_face_compare_start - timestamp_face_detect_end
    print(time_diff.total_seconds() * 1000)

    try:
        # CSV 파일 확인
        face_encodings = get_all_face_encodings_with_employee_info()
        if not face_encodings:
            return {"success": False, "message": "등록된 얼굴 데이터가 없습니다."}
        
        # Base64 이미지 데이터 디코딩
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
            
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="이미지 데이터를 디코딩할 수 없습니다.")
        
        # DeepFace로 얼굴 임베딩 추출
        embedding_obj = DeepFace.represent(
            img_path=img,
            model_name=FACE_MODEL,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True
        )
        
        if not embedding_obj or len(embedding_obj) == 0:
            return {
                "success": False,
                "message": "이미지에서 얼굴을 감지할 수 없습니다."
            }
        
        # 첫 번째 얼굴의 임베딩 벡터 추출
        embedding_vector = np.array(embedding_obj[0]["embedding"])
        
        # 각 등록된 얼굴과 비교
        matches = []

        for encoding_data in face_encodings:
            try:
                image_path = encoding_data['image_path']
                if not os.path.exists(image_path):
                    continue
                
                registered_vector = encoding_data['encoding']
                similarity = calculate_similarity(embedding_vector, registered_vector)
                
                # 이미지 Base64 인코딩
                registered_img = cv2.imread(image_path)
                if registered_img is not None:
                    _, buffer = cv2.imencode('.jpg', registered_img)
                    img_base64 = base64.b64encode(buffer).decode('utf-8')
                else:
                    continue
                
                # 일치 정보 추가
                matches.append({
                    "id": encoding_data['encoding_id'],
                    "employee_id": encoding_data['employee_id'],
                    "name": encoding_data['name'],
                    "department": encoding_data['department'],
                    "position": encoding_data['position'],
                    "employeeId": encoding_data['employeeId'],
                    "confidence": float(similarity),
                    "image_path": image_path,
                    "image_base64": img_base64
                })
            except Exception as e:
                print(f"얼굴 비교 중 오류: {str(e)}")
                continue
        
        # 유사도에 따라 정렬
        matches = sorted(matches, key=lambda x: x["confidence"], reverse=True)
        
        # 유사도 기준에 따라 결과 처리
        # 1. 0.75 이상 유사도: 가장 높은 유사도를 가진 얼굴 하나만 반환
        high_threshold = 0.75
        medium_threshold = 0.6
        
        high_matches = [match for match in matches if match["confidence"] >= high_threshold]
        if high_matches:
            best_match = high_matches[0]
            
            global timestamp_face_compare_end
            timestamp_face_compare_end = datetime.now()
            print('Timestamp - Face Compare End (High):', timestamp_face_compare_end)
            time_diff = timestamp_face_compare_end - timestamp_face_compare_start
            print(f"High match comparison time: {time_diff.total_seconds() * 1000} ms")
            
            return {
                "success": True,
                "match_type": "high",
                "best_match": best_match
            }
        
        # 2. 0.6 이상 0.75 미만 유사도: 상위 3개 후보 반환
        medium_matches = [match for match in matches if high_threshold > match["confidence"] >= medium_threshold]
        if medium_matches:
            # 최대 3개까지만 반환
            candidates = medium_matches[:3]
            
            timestamp_face_compare_end = datetime.now()
            print('Timestamp - Face Compare End (Medium):', timestamp_face_compare_end)
            time_diff = timestamp_face_compare_end - timestamp_face_compare_start
            print(f"Medium match comparison time: {time_diff.total_seconds() * 1000} ms")
            
            return {
                "success": True,
                "match_type": "medium",
                "candidates": candidates,
                "total_candidates": len(candidates)
            }
        
        # 3. 0.6 미만 유사도: 아무것도 반환하지 않음 (인식 실패)
        timestamp_face_compare_end = datetime.now()
        print('Timestamp - Face Compare End (Low):', timestamp_face_compare_end)
        time_diff = timestamp_face_compare_end - timestamp_face_compare_start
        print(f"Low match comparison time: {time_diff.total_seconds() * 1000} ms")
        
        return {
            "success": True,
            "match_type": "low",
            "message": "등록된 얼굴 중에 일치하는 얼굴을 찾지 못했습니다."
        }
    
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 비교 중 오류: {str(e)}\n{traceback_str}")
        return {
            "success": False,
            "message": f"얼굴 비교 중 오류: {str(e)}"
        }

def register_attendance(name, image_data=None):
    """출퇴근 기록 등록"""
    try:
        # 1. 직원 정보 조회
        employee_info = get_employee_info(name=name)
        if not employee_info:
            return {
                'success': False,
                'message': f'등록되지 않은 직원입니다: {name}'
            }
        
        # 2. 출퇴근 기록 저장 (employee_id 사용)
        result = record_attendance(employee_info['employee_id'])
        
        if result['success']:
            # 3. 결과에 직원 정보 추가
            result.update({
                'name': str(employee_info['name']),
                'department': str(employee_info.get('department', '')),
                'position': str(employee_info.get('position', '')),
                'employeeId': str(employee_info.get('employeeId', ''))
            })
            
            result['record_id'] = int(result['record_id'])
            result['employee_id'] = int(result['employee_id'])
            
            # 5. 이미지 데이터가 있으면 얼굴 추가 등록
            if image_data:
                try:
                    face_result = process_face_image(name, image_data, {
                        "source": "auto_register",
                        "memo": "출근 시스템에서 자동 등록된 얼굴"
                    })
                    result['face_registered'] = True
                    result['face_registration_details'] = face_result
                except Exception as e:
                    print(f"추가 얼굴 등록 중 오류: {str(e)}")
                    result['face_registered'] = False
                    result['face_registration_error'] = str(e)
        
        return result
        
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"출퇴근 기록 등록 중 오류: {str(e)}\n{traceback_str}")
        return {
            'success': False,
            'message': f"출퇴근 기록 등록 중 오류: {str(e)}"
        }