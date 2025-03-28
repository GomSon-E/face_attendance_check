# face_utils.py - 얼굴 처리 관련 유틸리티
import os
import cv2
import numpy as np
import pandas as pd
import base64
from datetime import datetime
from fastapi import HTTPException

# 자체 모듈 임포트
from config import DATA_DIR, FACE_MODEL, DETECTOR_BACKEND, create_path
from utils import sanitize_filename, vector_to_string, save_to_csv

# DeepFace 로드
try:
    from deepface import DeepFace
except Exception as e:
    print(f"DeepFace 로딩 실패: {e}")
    exit(1)

def process_face_image(name, image_data):
    """얼굴 이미지 처리 및 특징 벡터 추출"""
    # 이미지 저장 경로 지정 - 슬래시 사용
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = sanitize_filename(name)  # 한글 이름 문제 해결
    image_filename = f"{safe_name}_{timestamp}.jpg"
    image_path = create_path(DATA_DIR, image_filename)  # 슬래시 경로 사용
    
    print(f"원본 이름: {name}")
    print(f"변환된 이름: {safe_name}")
    print(f"이미지 저장 경로 (상대): {image_path}")
    print(f"이미지 저장 경로 (절대): {os.path.abspath(image_path)}")
    
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