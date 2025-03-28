# app.py - FastAPI 서버
import os
import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Body
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from typing import Optional, Dict, Any
import json
import time
from datetime import datetime
import base64
import shutil
import io
import re
import hashlib

# TensorFlow 로그 레벨 설정
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # 정보성 메시지 숨기기

# DeepFace 로드
try:
    from deepface import DeepFace
    print("DeepFace 로딩 성공")
except Exception as e:
    print(f"DeepFace 로딩 실패: {e}")
    exit(1)

app = FastAPI(title="얼굴 특징 벡터 추출 API")

# 정적 파일 서빙 (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# 디렉토리 및 파일 경로 설정 - 상대 경로 사용
DATA_DIR = "data_faces"  # 상대 경로
CSV_PATH = "face_encodings.csv"  # 상대 경로

# 경로 생성 시 슬래시 사용하는 함수
def create_path(*args):
    return '/'.join(args)

# 한글 이름 문제를 해결하기 위한 함수
def sanitize_filename(name):
    """한글 등 non-English 문자를 영문자로 변환 또는 제거"""
    # 이름에서 공백과 특수문자 제거
    clean_name = re.sub(r'[^a-zA-Z0-9가-힣]', '', name)
    
    # 한글이 포함된 경우 해시 기반 이름 생성
    if re.search('[가-힣]', clean_name):
        # 해시 생성 (이름이 같으면 항상 같은 ID가 생성됨)
        name_hash = hashlib.md5(name.encode('utf-8')).hexdigest()[:8]
        safe_name = f"person_{name_hash}"
    else:
        # 영문/숫자만 있으면 그대로 사용
        safe_name = clean_name
    
    return safe_name

# 디렉토리가 없으면 생성
os.makedirs(DATA_DIR, exist_ok=True)
print(f"데이터 디렉토리 경로: {os.path.abspath(DATA_DIR)}")

# CSV 파일 초기화 함수
def init_csv_file():
    if not os.path.exists(CSV_PATH):
        df = pd.DataFrame(columns=['name', 'image_path', 'encoding', 'timestamp'])
        df.to_csv(CSV_PATH, index=False)
        print(f"CSV 파일 '{CSV_PATH}'이 생성되었습니다.")

# 서버 시작 시 CSV 파일 초기화
init_csv_file()

# 벡터를 문자열로 변환
def vector_to_string(vector):
    return json.dumps(vector.tolist())

# 문자열을 벡터로 변환
def string_to_vector(string):
    return np.array(json.loads(string))

@app.get("/")
async def read_root():
    return FileResponse('static/index.html')

@app.post("/api/capture-face")
async def capture_face(data: Dict[str, Any] = Body(...)):
    """
    웹캠에서 캡처한 이미지에서 얼굴 특징 벡터를 추출하고 CSV에 저장
    """
    try:
        # 요청에서 데이터 추출
        name = data.get("name")
        image_data = data.get("image")
        
        if not name or not image_data:
            raise HTTPException(status_code=400, detail="이름과 이미지 데이터가 필요합니다.")
        
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
                model_name="Facenet",
                detector_backend="mtcnn",
                enforce_detection=False
            )
            
            if not embedding_obj or len(embedding_obj) == 0:
                raise HTTPException(status_code=400, detail="이미지에서 얼굴을 감지할 수 없습니다.")
            
            # 첫 번째 얼굴의 임베딩 벡터 추출
            embedding_vector = embedding_obj[0]["embedding"]
            
            # 벡터를 문자열로 변환
            embedding_str = vector_to_string(np.array(embedding_vector))
            
            # CSV에 추가
            try:
                df = pd.read_csv(CSV_PATH)
            except Exception as e:
                print(f"CSV 파일 읽기 오류, 새 DataFrame 생성: {e}")
                df = pd.DataFrame(columns=['name', 'image_path', 'encoding', 'timestamp'])
            
            new_row = {
                'name': name,
                'image_path': image_path,  # 상대 경로 저장
                'encoding': embedding_str,
                'timestamp': datetime.now().isoformat()
            }
            
            # pd.concat 사용
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            df.to_csv(CSV_PATH, index=False)
            
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
            
        except Exception as e:
            import traceback
            traceback_str = traceback.format_exc()
            print(f"특징 벡터 추출 중 오류: {str(e)}\n{traceback_str}")
            
            # 저장된 이미지 삭제 (오류 발생 시)
            if os.path.exists(image_path):
                os.remove(image_path)
                print(f"오류로 인해 이미지 파일 삭제: {image_path}")
                
            raise HTTPException(status_code=500, detail=f"특징 벡터 추출 중 오류: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"요청 처리 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"요청 처리 중 오류: {str(e)}")

@app.get("/api/faces")
async def get_faces():
    """
    저장된 모든 얼굴 데이터 목록 반환
    """
    try:
        if not os.path.exists(CSV_PATH):
            return {"faces": []}
        
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
        
        return {"faces": faces}
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 데이터 조회 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"얼굴 데이터 조회 중 오류: {str(e)}")

@app.delete("/api/faces/{face_id}")
async def delete_face(face_id: int):
    """
    특정 얼굴 데이터 삭제
    """
    try:
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
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 데이터 삭제 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"얼굴 데이터 삭제 중 오류: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)