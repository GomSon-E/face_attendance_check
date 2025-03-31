# app.py - 메인 FastAPI 애플리케이션
import os
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from typing import Dict, Any
import json
import math

# 자체 모듈 임포트
from config import DATA_DIR, CSV_PATH
from utils import init_csv_file, init_attendance_csv, get_attendance_records
from face_utils import (
    process_face_image, 
    get_all_faces, 
    delete_face_data, 
    detect_face, 
    compare_face,
    register_attendance
)

# FastAPI 앱 생성
app = FastAPI(title="얼굴 특징 벡터 추출 및 비교 API")

# 정적 파일 서빙 (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# 디렉토리가 없으면 생성
os.makedirs(DATA_DIR, exist_ok=True)
print(f"데이터 디렉토리 경로: {os.path.abspath(DATA_DIR)}")

# 서버 시작 시 CSV 파일 초기화
init_csv_file()
init_attendance_csv()

@app.get("/face_register")
async def read_root():
    """루트 경로 접근 시 인덱스 페이지 반환"""
    return FileResponse('static/face_register.html')

@app.get("/face_compare")
async def face_compare_page():
    """얼굴 비교 페이지 반환"""
    return FileResponse('static/face_compare.html')

@app.get("/attendance")
async def attendance_page():
    """출퇴근 기록 조회 페이지 반환"""
    return FileResponse('static/attendance.html')

@app.post("/api/capture-face")
async def capture_face(data: Dict[str, Any] = Body(...)):
    """웹캠에서 캡처한 이미지에서 얼굴 특징 벡터를 추출하고 CSV에 저장"""
    try:
        # 요청에서 데이터 추출
        name = data.get("name")
        image_data = data.get("image")
        
        if not name or not image_data:
            raise HTTPException(status_code=400, detail="이름과 이미지 데이터가 필요합니다.")
            
        # 이미지 처리 및 얼굴 벡터 추출
        result = process_face_image(name, image_data)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"요청 처리 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"요청 처리 중 오류: {str(e)}")

@app.get("/api/faces")
async def get_faces():
    """저장된 모든 얼굴 데이터 목록 반환"""
    try:
        faces = get_all_faces()
        return {"faces": faces}
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 데이터 조회 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"얼굴 데이터 조회 중 오류: {str(e)}")

@app.delete("/api/faces/{face_id}")
async def delete_face(face_id: int):
    """특정 얼굴 데이터 삭제"""
    try:
        result = delete_face_data(face_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 데이터 삭제 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"얼굴 데이터 삭제 중 오류: {str(e)}")

@app.post("/api/detect-face")
async def detect_face_api(data: Dict[str, Any] = Body(...)):
    """이미지에서 얼굴 감지"""
    try:
        image_data = data.get("image")
        
        if not image_data:
            raise HTTPException(status_code=400, detail="이미지 데이터가 필요합니다.")
        
        result = detect_face(image_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 감지 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"얼굴 감지 중 오류: {str(e)}")

@app.post("/api/compare-face")
async def compare_face_api(data: Dict[str, Any] = Body(...)):
    """캡처된 얼굴과 등록된 얼굴들 비교"""
    try:
        image_data = data.get("image")
        
        if not image_data:
            raise HTTPException(status_code=400, detail="이미지 데이터가 필요합니다.")
        
        result = compare_face(image_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"얼굴 비교 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"얼굴 비교 중 오류: {str(e)}")

@app.post("/api/register-attendance")
async def register_attendance_api(data: Dict[str, Any] = Body(...)):
    """출퇴근 기록 등록 API"""
    try:
        name = data.get("name")
        image_data = data.get("image", None)
        
        if not name:
            raise HTTPException(status_code=400, detail="이름이 필요합니다.")
        
        result = register_attendance(name, image_data)
        
        if result['success']:
            return result
        else:
            raise HTTPException(status_code=500, detail=result['message'])
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"출퇴근 기록 등록 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"출퇴근 기록 등록 중 오류: {str(e)}")

@app.get("/api/attendance")
async def get_attendance_api(
    name: str = None,
    start_date: str = None,
    end_date: str = None,
    tag: str = None
):
    """출퇴근 기록 조회 API"""
    try:
        # 필터 구성
        filters = {
            'name': name,
            'start_date': start_date,
            'end_date': end_date,
            'tag': tag
        }
        
        # 필터가 모두 None이면 빈 필터로 설정
        if all(value is None for value in filters.values()):
            filters = None
        
        # 출퇴근 기록 조회
        records = get_attendance_records(filters)
        
        # JSON 직렬화 가능 여부 확인 및 안전한 변환
        def is_json_serializable(obj):
            try:
                json.dumps(obj)
                return True
            except (TypeError, OverflowError, ValueError):
                return False
        
        # 안전하게 직렬화 가능한 값만 반환
        safe_records = []
        for record in records:
            safe_record = {}
            for key, value in record.items():
                if is_json_serializable(value):
                    safe_record[key] = value
                else:
                    # 문제가 있는 값은 문자열로 변환
                    if isinstance(value, float):
                        if math.isnan(value):
                            safe_record[key] = ""
                        elif math.isinf(value):
                            safe_record[key] = "Infinity" if value > 0 else "-Infinity"
                        else:
                            safe_record[key] = str(value)
                    else:
                        safe_record[key] = str(value)
            safe_records.append(safe_record)
        
        return {
            "success": True,
            "records": safe_records,
            "total": len(safe_records)
        }
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"출퇴근 기록 조회 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"출퇴근 기록 조회 중 오류: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)