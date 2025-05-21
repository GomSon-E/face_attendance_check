# face_utils.py - 얼굴 처리 관련 유틸리티
import os
import cv2
import numpy as np
import pandas as pd
import base64
from datetime import datetime
from fastapi import HTTPException
from typing import Dict, Any, List

# 자체 모듈 임포트
from config import DATA_DIR, FACE_MODEL, DETECTOR_BACKEND, create_path
from utils import sanitize_filename, vector_to_string, save_to_csv, string_to_vector, record_attendance

# DeepFace 로드
try:
    from deepface import DeepFace
except Exception as e:
    print(f"DeepFace 로딩 실패: {e}")
    exit(1)

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
        save_result = save_to_csv(
            name=name,
            department=metadata.get("department", ""),
            position=metadata.get("position", ""),
            employeeId=metadata.get("employeeId", ""),
            image_path=image_path,
            encoding_vector=np.array(embedding_vector),
            timestamp=datetime.now().isoformat()
        )
        
        if not save_result:
            raise HTTPException(status_code=500, detail="데이터를 CSV 파일에 저장하지 못했습니다.")
        
        # 이미지를 Base64로 인코딩하여 응답
        _, buffer = cv2.imencode('.jpg', img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "success": True,
            "message": f"{name}의 얼굴 특징 벡터가 성공적으로 추출되어 저장되었습니다.",
            "name": name,
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
    from config import CSV_PATH
    
    if not os.path.exists(CSV_PATH):
        return []
    
    df = pd.read_csv(CSV_PATH)
    faces = []
    
    for index, row in df.iterrows():
        image_path = row['image_path']
        if os.path.exists(image_path):
            try:
                # 이미지 파일 읽기
                img = cv2.imread(image_path)
                if img is not None:
                    # 이미지를 Base64로 인코딩
                    _, buffer = cv2.imencode('.jpg', img)
                    img_base64 = base64.b64encode(buffer).decode('utf-8')
                    
                    faces.append({
                        "id": int(index),
                        "name": row['name'],
                        "image_path": image_path,
                        "timestamp": row['timestamp'],
                        "image_base64": img_base64
                    })
                else:
                    print(f"경고: 이미지를 읽을 수 없음: {image_path}")
            except Exception as e:
                print(f"이미지 {image_path} 처리 중 오류: {str(e)}")
        else:
            print(f"경고: 이미지 파일이 존재하지 않음: {image_path}")
    
    return faces

def delete_face_data(face_id):
    """특정 얼굴 데이터 삭제"""
    from config import CSV_PATH
    
    df = pd.read_csv(CSV_PATH)
    if face_id >= len(df):
        raise HTTPException(status_code=404, detail="해당 ID의 얼굴 데이터를 찾을 수 없습니다.")
    
    # 이미지 파일 삭제
    image_path = df.loc[face_id, 'image_path']
    if os.path.exists(image_path):
        os.remove(image_path)
        print(f"이미지 파일 삭제됨: {image_path}")
    else:
        print(f"경고: 삭제할 이미지 파일이 존재하지 않음: {image_path}")
    
    # CSV에서 해당 행 삭제
    df = df.drop(face_id).reset_index(drop=True)
    df.to_csv(CSV_PATH, index=False)
    
    return {"success": True, "message": "얼굴 데이터가 성공적으로 삭제되었습니다."}

def calculate_similarity(vector1: np.ndarray, vector2: np.ndarray) -> float:
    """두 벡터 간의 유클리드 거리 기반 유사도 계산"""
    try:
        # 벡터 형태 확인 및 조정
        v1 = vector1.flatten()
        v2 = vector2.flatten()
        
        # 유클리드 거리 계산
        euclidean_dist = np.linalg.norm(v1 - v2)
        
        # 거리가 너무 크거나 NaN인 경우 처리
        if np.isnan(euclidean_dist) or np.isinf(euclidean_dist):
            return 0.0
        
        # 거리를 유사도로 변환 (거리가 작을수록 유사도는 높음)
        # 지수 함수를 사용하여 [0, 1] 범위로 변환 (1이 가장 유사)
        # 거리가 0이면 유사도는 1, 거리가 커질수록 유사도는 0에 가까워짐
        similarity = np.exp(-euclidean_dist / 10.0)
        
        # NaN이나 무한대 값 체크
        if np.isnan(similarity) or np.isinf(similarity):
            return 0.0
            
        return float(similarity)  # float 타입으로 명시적 변환
    except Exception as e:
        print(f"유사도 계산 중 오류: {str(e)}")
        return 0.0  # 오류 발생 시 기본값 반환

def detect_face(image_data: str) -> Dict[str, Any]:
    """이미지에서 얼굴 감지"""
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
        
        # 유효한 얼굴 찾기
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
                "message": "유효한 얼굴이 감지되지 않았습니다."
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
        from config import CSV_PATH
        
        if not os.path.exists(CSV_PATH):
            return {
                "success": False,
                "message": "등록된 얼굴 데이터가 없습니다."
            }
        
        # 등록된 얼굴 데이터 로드
        df = pd.read_csv(CSV_PATH)
        if df.empty:
            return {
                "success": False,
                "message": "등록된 얼굴 데이터가 없습니다."
            }
        
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
            enforce_detection=False
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

        for index, row in df.iterrows():
            try:
                # 이미지 파일 존재 여부 확인
                image_path = row['image_path']
                if not os.path.exists(image_path):
                    print(f"경고: 이미지 파일이 존재하지 않음: {image_path}")
                    continue
                
                # 등록된 얼굴 벡터 가져오기
                registered_vector = string_to_vector(row['encoding'])
                
                # 유사도 계산
                similarity = calculate_similarity(embedding_vector, registered_vector)
                
                # NaN이나 무한대 값 처리
                if np.isnan(similarity) or np.isinf(similarity):
                    similarity = 0.0
                
                # 이미지를 Base64로 인코딩
                try:
                    registered_img = cv2.imread(image_path)
                    if registered_img is not None:
                        _, buffer = cv2.imencode('.jpg', registered_img)
                        img_base64 = base64.b64encode(buffer).decode('utf-8')
                    else:
                        print(f"경고: 이미지를 읽을 수 없음: {image_path}")
                        continue
                except Exception as e:
                    print(f"이미지 인코딩 중 오류: {str(e)}")
                    continue
                
                # 값이 존재하는지 확인하고 안전한 값으로 설정
                name = row.get('name', '')
                department = row.get('department', '') 
                position = row.get('position', '')
                employeeId = row.get('employeeId', '')
                timestamp = row.get('timestamp', '')
                
                # 일치 정보 추가 - 사용자 메타데이터 추가 포함
                matches.append({
                    "id": int(index),
                    "name": name if isinstance(name, str) else str(name),
                    "department": department if isinstance(department, str) else str(department),
                    "position": position if isinstance(position, str) else str(position),
                    "employeeId": employeeId if isinstance(employeeId, str) else str(employeeId),
                    "confidence": float(similarity),  # 명시적으로 float으로 변환
                    "image_path": image_path,
                    "timestamp": timestamp if isinstance(timestamp, str) else str(timestamp),
                    "image_base64": img_base64
                })
            except Exception as e:
                print(f"얼굴 비교 중 오류 (인덱스 {index}): {str(e)}")
                continue
        
        # 유사도에 따라 정렬
        matches = sorted(matches, key=lambda x: x["confidence"], reverse=True)
        
        # 유사도 기준에 따라 결과 처리
        # 1. 0.7 이상 유사도: 가장 높은 유사도를 가진 얼굴 하나만 반환
        high_threshold = 0.7
        medium_threshold = 0.5
        
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
        
        # 2. 0.5 이상 0.7 미만 유사도: 상위 3개 후보 반환
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
        
        # 3. 0.5 미만 유사도: 아무것도 반환하지 않음 (인식 실패)
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
        # 출퇴근 기록
        result = record_attendance(name)
        
        # 이미지 데이터가 있으면 얼굴 추가 등록
        if image_data and result['success']:
            try:
                # 이미지 추가 등록
                face_result = process_face_image(name, image_data, {
                    "source": "auto_register",
                    "memo": "출석 시스템에서 자동 등록된 얼굴"
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