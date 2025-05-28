# app.py
import os
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import Dict, Any
import json
import math
import ssl

# 자체 모듈 임포트
from config import DATA_DIR
from utils import (
    init_csv_files, 
    get_attendance_records_with_employee_info, 
    update_attendance_record, 
    get_employee_info, 
    get_all_employees, 
    get_face_encodings_by_employee, 
    update_employee_info, 
    get_employee_faces_with_base64
)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# 디렉토리가 없으면 생성
os.makedirs(DATA_DIR, exist_ok=True)
print(f"데이터 디렉토리 경로: {os.path.abspath(DATA_DIR)}")

# 서버 시작 시 CSV 파일 초기화
init_csv_files()

def sanitize_json_values(data):
    """JSON 직렬화 전에 안전한 값으로 변환"""
    import numpy as np
    import pandas as pd
    
    if isinstance(data, dict):
        return {k: sanitize_json_values(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_json_values(item) for item in data]
    elif isinstance(data, np.integer):
        return int(data)
    elif isinstance(data, np.floating):
        if np.isnan(data):
            return None
        elif np.isinf(data):
            return str(data)
        return float(data)
    elif isinstance(data, np.ndarray):
        return data.tolist()
    elif isinstance(data, float):
        import math
        if math.isnan(data):
            return None
        elif math.isinf(data):
            return str(data)
        return data
    elif pd.isna(data):
        return None
    elif isinstance(data, (int, bool, str, type(None))):
        return data
    else:
        # 기타 타입은 문자열로 변환
        try:
            return str(data)
        except:
            return None

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

@app.get("/statistics")
async def statistics_page():
    """출퇴근 통계 페이지 반환"""
    return FileResponse('static/statistics.html')

@app.get("/test_process")
async def read_root():
    """테스트 페이지 반환"""
    return FileResponse('static/test_process.html')

@app.get("/employee_management")
async def employee_management_page():
    """직원 관리 페이지 반환"""
    return FileResponse('static/employee_management.html')

@app.post("/api/capture-face")
async def capture_face(data: Dict[str, Any] = Body(...)):
    """웹캠에서 캡처한 이미지에서 얼굴 특징 벡터를 추출하고 CSV에 저장"""
    try:
        # 요청에서 데이터 추출
        name = data.get("name")
        image_data = data.get("image")
        
        metadata = data.get("metadata")
        
        if not name or not image_data:
            raise HTTPException(status_code=400, detail="이름과 이미지 데이터가 필요합니다.")
            
        # 이미지 처리 및 얼굴 벡터 추출
        result = process_face_image(name, image_data, metadata)
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
        sanitized_result = sanitize_json_values(result)
        return sanitized_result
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
    department: str = None,
    position: str = None,
    employeeId: str = None,
    start_date: str = None,
    end_date: str = None,
    tag: str = None
):
    """출퇴근 기록 조회 API"""
    try:
        # 필터 구성
        filters = {
            'name': name,
            'department': department,
            'position': position,
            'employeeId': employeeId,
            'start_date': start_date,
            'end_date': end_date,
            'tag': tag
        }
        
        # 필터가 모두 None이면 빈 필터로 설정
        if all(value is None for value in filters.values()):
            filters = None
        
        # 출퇴근 기록 조회
        records = get_attendance_records_with_employee_info(filters)
        
        # JSON 직렬화를 위해 안전한 값으로 변환
        safe_records = []
        for record in records:
            safe_record = {}
            for key, value in record.items():
                # 특수 부동 소수점 값 처리
                if isinstance(value, float):
                    if math.isnan(value):
                        safe_record[key] = None  # NaN을 None으로 변환
                    elif math.isinf(value):
                        safe_record[key] = str(value)  # Infinity를 문자열로 변환
                    else:
                        safe_record[key] = value
                # 기타 비직렬화 가능한 객체 처리
                elif not isinstance(value, (str, int, float, bool, list, dict, type(None))):
                    safe_record[key] = str(value)
                else:
                    safe_record[key] = value
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

@app.put("/api/attendance/{record_id}")
async def update_attendance_api(record_id: int, data: Dict[str, Any] = Body(...)):
    """출퇴근 기록 태그 수정 API (record_id 기반)"""
    try:
        tag = data.get("tag")
        
        if tag is None:
            raise HTTPException(status_code=400, detail="태그 값이 필요합니다.")
        
        # 유효한 태그 값 확인
        valid_tags = ["출근", "퇴근", "외근", "지각", "반차", ""]
        if tag not in valid_tags:
            raise HTTPException(status_code=400, detail=f"유효하지 않은 태그입니다. 유효한 값: {', '.join(valid_tags)}")
        
        # 출퇴근 기록 업데이트
        result = update_attendance_record(record_id, tag)
        
        if result['success']:
            return result
        else:
            raise HTTPException(status_code=404, detail=result['message'])
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"출퇴근 기록 수정 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"출퇴근 기록 수정 중 오류: {str(e)}")

@app.get("/api/employees")
async def get_all_employees_api(
    name: str = None,
    department: str = None,
    position: str = None,
    employeeId: str = None
):
    """모든 직원 정보와 얼굴 개수를 함께 조회 (검색 필터 지원)"""
    try:
        # 직원 정보 조회
        employees = get_all_employees()
        
        # 검색 필터 적용
        if name:
            employees = [emp for emp in employees if name.lower() in (emp.get('name', '') or '').lower()]
        if department:
            employees = [emp for emp in employees if department.lower() in (emp.get('department', '') or '').lower()]
        if position:
            employees = [emp for emp in employees if position.lower() in (emp.get('position', '') or '').lower()]
        if employeeId:
            employees = [emp for emp in employees if employeeId.lower() in (emp.get('employeeId', '') or '').lower()]
        
        # 각 직원의 얼굴 개수 조회
        for employee in employees:
            face_encodings = get_face_encodings_by_employee(employee['employee_id'])
            employee['face_count'] = len(face_encodings)
        
        return {
            "success": True,
            "employees": employees,
            "total": len(employees)
        }
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"직원 목록 조회 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"직원 목록 조회 중 오류: {str(e)}")

@app.put("/api/employees/{employee_id}")
async def update_employee_api(employee_id: int, data: Dict[str, Any] = Body(...)):
    """직원 정보 수정"""
    try:
        # 기존 직원 확인
        existing_employee = get_employee_info(employee_id=employee_id)
        if not existing_employee:
            raise HTTPException(status_code=404, detail="해당 직원을 찾을 수 없습니다.")
        
        name = data.get("name", "").strip()
        department = data.get("department", "").strip()
        position = data.get("position", "").strip()
        employeeId = data.get("employeeId", "").strip()
        
        if not name:
            raise HTTPException(status_code=400, detail="이름은 필수 입력 항목입니다.")
        
        # 다른 직원과 이름 중복 체크
        name_duplicate = get_employee_info(name=name)
        if name_duplicate and name_duplicate['employee_id'] != employee_id:
            raise HTTPException(status_code=400, detail="이미 사용 중인 이름입니다.")
        
        # 직원 정보 업데이트
        result = update_employee_info(employee_id, name, department, position, employeeId)
        
        if result['success']:
            updated_employee = get_employee_info(employee_id=employee_id)
            return {
                "success": True,
                "message": "직원 정보가 성공적으로 수정되었습니다.",
                "employee": updated_employee
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('message', '직원 정보 수정에 실패했습니다.'))
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"직원 정보 수정 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"직원 정보 수정 중 오류: {str(e)}")

@app.get("/api/employees/{employee_id}/faces")
async def get_employee_faces_api(employee_id: int):
    """특정 직원의 모든 얼굴 이미지 조회"""
    try:
        # 직원 존재 확인
        employee = get_employee_info(employee_id=employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="해당 직원을 찾을 수 없습니다.")
        
        # 얼굴 이미지들 조회 (Base64 포함)
        faces = get_employee_faces_with_base64(employee_id)
        
        return {
            "success": True,
            "faces": faces,
            "total": len(faces)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"직원 얼굴 이미지 조회 중 오류: {str(e)}\n{traceback_str}")
        raise HTTPException(status_code=500, detail=f"직원 얼굴 이미지 조회 중 오류: {str(e)}")

if __name__ == "__main__":
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain('certificate\localhost+4.pem', 'certificate\localhost+4-key.pem')
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ssl_keyfile="certificate\localhost+4-key.pem",
        ssl_certfile="certificate\localhost+4.pem"
    )