import os
import re
import hashlib
import pandas as pd
import numpy as np
import json
import datetime
from config import EMPLOYEES_CSV_PATH, FACE_ENCODINGS_CSV_PATH, ATTENDANCE_CSV_PATH, ATTENDANCE_TIMES

def init_csv_files():
    """모든 CSV 파일 초기화 함수"""
    init_employees_csv()
    init_face_encodings_csv()
    init_attendance_csv()

def init_employees_csv():
    """직원 정보 CSV 파일 초기화"""
    if not os.path.exists(EMPLOYEES_CSV_PATH):
        df = pd.DataFrame(columns=['employee_id', 'name', 'department', 'position', 'employeeId'])
        df.to_csv(EMPLOYEES_CSV_PATH, index=False)
        print(f"직원 정보 CSV 파일 '{EMPLOYEES_CSV_PATH}'이 생성되었습니다.")

def init_face_encodings_csv():
    """얼굴 벡터 CSV 파일 초기화"""
    if not os.path.exists(FACE_ENCODINGS_CSV_PATH):
        df = pd.DataFrame(columns=['encoding_id', 'employee_id', 'image_path', 'encoding'])
        df.to_csv(FACE_ENCODINGS_CSV_PATH, index=False)
        print(f"얼굴 벡터 CSV 파일 '{FACE_ENCODINGS_CSV_PATH}'이 생성되었습니다.")

def init_attendance_csv():
    """출퇴근 기록 CSV 파일 초기화"""
    if not os.path.exists(ATTENDANCE_CSV_PATH):
        df = pd.DataFrame(columns=['record_id', 'employee_id', 'date', 'time', 'tag'])
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        print(f"출퇴근 기록 CSV 파일 '{ATTENDANCE_CSV_PATH}'이 생성되었습니다.")

def sanitize_filename(name):
    """한글 등 non-English 문자를 영문자로 변환 또는 제거"""
    clean_name = re.sub(r'[^a-zA-Z0-9가-힣]', '', name)
    
    if re.search('[가-힣]', clean_name):
        name_hash = hashlib.md5(name.encode('utf-8')).hexdigest()[:8]
        safe_name = f"person_{name_hash}"
    else:
        safe_name = clean_name
    
    return safe_name

def vector_to_string(vector):
    """벡터를 문자열로 변환"""
    return json.dumps(vector.tolist())

def string_to_vector(string):
    """문자열을 벡터로 변환"""
    return np.array(json.loads(string))

# === 직원 관리 함수들 ===

def get_or_create_employee(name, department="", position="", employeeId=""):
    """직원 정보를 가져오거나 새로 생성"""
    try:
        df = pd.read_csv(EMPLOYEES_CSV_PATH)
        
        # 기존 직원 찾기 (이름으로 검색)
        existing_employee = df[df['name'] == name]
        
        if not existing_employee.empty:
            # 기존 직원 정보 업데이트 (빈 값이 아닌 경우만)
            employee_id = existing_employee.iloc[0]['employee_id']
            idx = existing_employee.index[0]
            
            updated = False
            if department and df.loc[idx, 'department'] != department:
                df.loc[idx, 'department'] = department
                updated = True
            if position and df.loc[idx, 'position'] != position:
                df.loc[idx, 'position'] = position
                updated = True
            if employeeId and df.loc[idx, 'employeeId'] != employeeId:
                df.loc[idx, 'employeeId'] = employeeId
                updated = True
            
            if updated:
                df.loc[idx, 'updated_at'] = datetime.datetime.now().isoformat()
                df.to_csv(EMPLOYEES_CSV_PATH, index=False)
                print(f"직원 정보 업데이트: {name} (ID: {employee_id})")
            
            return int(employee_id)
        else:
            # 새 직원 생성
            new_employee_id = df['employee_id'].max() + 1 if not df.empty else 1
            
            new_row = {
                'employee_id': new_employee_id,
                'name': name,
                'department': department,
                'position': position,
                'employeeId': employeeId
            }
            
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            df.to_csv(EMPLOYEES_CSV_PATH, index=False)
            print(f"새 직원 생성: {name} (ID: {new_employee_id})")
            
            return new_employee_id
            
    except Exception as e:
        print(f"직원 정보 처리 중 오류: {str(e)}")
        return None

def get_employee_info(employee_id=None, name=None):
    """직원 정보 조회"""
    try:
        df = pd.read_csv(EMPLOYEES_CSV_PATH)
        
        if employee_id is not None:
            employee = df[df['employee_id'] == employee_id]
        elif name is not None:
            employee = df[df['name'] == name]
        else:
            return None
        
        if employee.empty:
            return None
        
        return employee.iloc[0].to_dict()
        
    except Exception as e:
        print(f"직원 정보 조회 중 오류: {str(e)}")
        return None

def get_all_employees():
    """모든 직원 정보 조회"""
    try:
        df = pd.read_csv(EMPLOYEES_CSV_PATH)
        return df.to_dict('records')
    except Exception as e:
        print(f"전체 직원 정보 조회 중 오류: {str(e)}")
        return []

# === 얼굴 벡터 관리 함수들 ===

def save_face_encoding(employee_id, image_path, encoding_vector):
    """얼굴 벡터 저장"""
    try:
        df = pd.read_csv(FACE_ENCODINGS_CSV_PATH)
        
        new_encoding_id = df['encoding_id'].max() + 1 if not df.empty else 1
        
        new_row = {
            'encoding_id': new_encoding_id,
            'employee_id': employee_id,
            'image_path': image_path,
            'encoding': vector_to_string(encoding_vector)
        }
        
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df.to_csv(FACE_ENCODINGS_CSV_PATH, index=False)
        
        return new_encoding_id
        
    except Exception as e:
        print(f"얼굴 벡터 저장 중 오류: {str(e)}")
        return None

def get_face_encodings_by_employee(employee_id):
    """특정 직원의 모든 얼굴 벡터 조회"""
    try:
        df = pd.read_csv(FACE_ENCODINGS_CSV_PATH)
        encodings = df[df['employee_id'] == employee_id]
        
        results = []
        for _, row in encodings.iterrows():
            results.append({
                'encoding_id': row['encoding_id'],
                'employee_id': row['employee_id'],
                'image_path': row['image_path'],
                'encoding': string_to_vector(row['encoding'])
            })
        
        return results
        
    except Exception as e:
        print(f"얼굴 벡터 조회 중 오류: {str(e)}")
        return []

def get_all_face_encodings_with_employee_info():
    """모든 얼굴 벡터와 직원 정보를 함께 조회"""
    try:
        # 얼굴 벡터 데이터 로드
        face_df = pd.read_csv(FACE_ENCODINGS_CSV_PATH)
        # 직원 정보 데이터 로드
        employee_df = pd.read_csv(EMPLOYEES_CSV_PATH)
        
        # 조인하여 합치기
        merged_df = pd.merge(face_df, employee_df, on='employee_id', how='left')
        
        results = []
        for _, row in merged_df.iterrows():
            results.append({
                'encoding_id': row['encoding_id'],
                'employee_id': row['employee_id'],
                'name': row['name'],
                'department': row.get('department', ''),
                'position': row.get('position', ''),
                'employeeId': row.get('employeeId', ''),
                'image_path': row['image_path'],
                'encoding': string_to_vector(row['encoding'])
            })
        
        return results
        
    except Exception as e:
        print(f"얼굴 벡터 및 직원 정보 조회 중 오류: {str(e)}")
        return []

def delete_face_encoding(encoding_id):
    """얼굴 벡터 삭제"""
    try:
        df = pd.read_csv(FACE_ENCODINGS_CSV_PATH)
        
        # 해당 얼굴 벡터 찾기
        target_row = df[df['encoding_id'] == encoding_id]
        if target_row.empty:
            return False
        
        # 이미지 파일 삭제
        image_path = target_row.iloc[0]['image_path']
        if os.path.exists(image_path):
            os.remove(image_path)
            print(f"이미지 파일 삭제됨: {image_path}")
        
        # CSV에서 해당 행 삭제
        df = df[df['encoding_id'] != encoding_id]
        df.to_csv(FACE_ENCODINGS_CSV_PATH, index=False)
        
        return True
        
    except Exception as e:
        print(f"얼굴 벡터 삭제 중 오류: {str(e)}")
        return False

# === 출퇴근 기록 관리 함수들 ===

def determine_attendance_tag():
    """현재 시간에 따른 출퇴근 태그 결정"""
    current_hour = datetime.datetime.now().hour
    
    if ATTENDANCE_TIMES["CLOCK_IN"][0] <= current_hour < ATTENDANCE_TIMES["CLOCK_IN"][1]:
        return "출근"
    elif ATTENDANCE_TIMES["LATE"][0] <= current_hour < ATTENDANCE_TIMES["LATE"][1]:
        return "지각"
    elif ATTENDANCE_TIMES["NONE"][0] <= current_hour < ATTENDANCE_TIMES["NONE"][1]:
        return ""
    elif ATTENDANCE_TIMES["CLOCK_OUT"][0] <= current_hour < ATTENDANCE_TIMES["CLOCK_OUT"][1]:
        return "퇴근"
    elif ATTENDANCE_TIMES["EARLY_CLOCK_IN"][0] <= current_hour < ATTENDANCE_TIMES["EARLY_CLOCK_IN"][1]:
        return ""
    else:
        return ""

def record_attendance(employee_id):
    """출퇴근 기록 저장"""
    try:
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        tag = determine_attendance_tag()
        
        # 출퇴근 기록 CSV 읽기
        df = pd.read_csv(ATTENDANCE_CSV_PATH)
        
        # record_id 생성
        new_record_id = df['record_id'].max() + 1 if not df.empty else 1
        
        # 새 기록 추가
        new_row = {
            'record_id': new_record_id,
            'employee_id': employee_id,
            'date': date_str,
            'time': time_str,
            'tag': tag
        }
        
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        
        return {
            'success': True,
            'record_id': new_record_id,
            'employee_id': employee_id,
            'date': date_str,
            'time': time_str,
            'tag': tag
        }
        
    except Exception as e:
        print(f"출퇴근 기록 저장 오류: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def get_attendance_records_with_employee_info(filters=None):
    """출퇴근 기록과 직원 정보를 함께 조회"""
    try:
        # 출퇴근 기록 데이터 로드
        attendance_df = pd.read_csv(ATTENDANCE_CSV_PATH)
        # 직원 정보 데이터 로드
        employee_df = pd.read_csv(EMPLOYEES_CSV_PATH)
        
        # 조인하여 합치기
        merged_df = pd.merge(attendance_df, employee_df, on='employee_id', how='left')
        
        # 누락된 값 처리
        merged_df = merged_df.fillna('')
        
        # 필터링 적용
        if filters:
            # 이름 필터
            if 'name' in filters and filters['name']:
                merged_df = merged_df[merged_df['name'].str.contains(filters['name'], case=False, na=False)]
            
            # 부서 필터
            if 'department' in filters and filters['department']:
                merged_df = merged_df[merged_df['department'].str.contains(filters['department'], case=False, na=False)]
            
            # 직급 필터
            if 'position' in filters and filters['position']:
                merged_df = merged_df[merged_df['position'].str.contains(filters['position'], case=False, na=False)]
            
            # 사번 필터
            if 'employeeId' in filters and filters['employeeId']:
                merged_df = merged_df[merged_df['employeeId'].str.contains(filters['employeeId'], case=False, na=False)]
            
            # 날짜 필터
            if 'start_date' in filters and filters['start_date']:
                try:
                    start_date = pd.to_datetime(filters['start_date']).date()
                    merged_df['date_parsed'] = pd.to_datetime(merged_df['date'], errors='coerce').dt.date
                    merged_df = merged_df[merged_df['date_parsed'] >= start_date]
                except Exception as e:
                    print(f"시작일 파싱 오류: {e}")
            
            if 'end_date' in filters and filters['end_date']:
                try:
                    end_date = pd.to_datetime(filters['end_date']).date()
                    if 'date_parsed' not in merged_df.columns:
                        merged_df['date_parsed'] = pd.to_datetime(merged_df['date'], errors='coerce').dt.date
                    merged_df = merged_df[merged_df['date_parsed'] <= end_date]
                except Exception as e:
                    print(f"종료일 파싱 오류: {e}")
            
            # 임시 컬럼 제거
            if 'date_parsed' in merged_df.columns:
                merged_df = merged_df.drop('date_parsed', axis=1)
            
            # 태그 필터
            if 'tag' in filters and filters['tag']:
                if filters['tag'] == 'empty':
                    merged_df = merged_df[merged_df['tag'] == '']
                else:
                    merged_df = merged_df[merged_df['tag'] == filters['tag']]
        
        # 날짜와 시간 기준으로 정렬 (최신순)
        merged_df = merged_df.sort_values(by=['date', 'time'], ascending=[False, False])
        
        # 안전한 값으로 변환
        def safe_value(val):
            if pd.isna(val) or (isinstance(val, float) and np.isnan(val)):
                return ''
            elif isinstance(val, float) and np.isinf(val):
                return 'Infinity' if val > 0 else '-Infinity'
            return val
        
        merged_df_safe = merged_df.copy()
        for col in merged_df_safe.columns:
            merged_df_safe[col] = merged_df_safe[col].apply(safe_value)
        
        # 필요한 컬럼만 선택
        result_columns = ['record_id', 'employee_id', 'name', 'department', 'position', 'employeeId', 'date', 'time', 'tag']
        available_columns = [col for col in result_columns if col in merged_df_safe.columns]
        
        records = merged_df_safe[available_columns].to_dict('records')
        
        return records
        
    except Exception as e:
        print(f"출퇴근 기록 조회 중 오류: {str(e)}")
        return []

def update_attendance_record(record_id, new_tag):
    """출퇴근 기록의 태그 업데이트"""
    try:
        df = pd.read_csv(ATTENDANCE_CSV_PATH)
        
        # record_id로 해당 기록 찾기
        target_rows = df[df['record_id'] == record_id]
        
        if target_rows.empty:
            return {
                'success': False,
                'message': f'record_id {record_id}에 해당하는 출퇴근 기록을 찾을 수 없습니다.'
            }
        
        # 첫 번째 일치하는 행의 인덱스 가져오기
        target_index = target_rows.index[0]
        
        # 이전 값 저장
        old_tag = df.loc[target_index, 'tag']
        if pd.isna(old_tag) or (isinstance(old_tag, float) and np.isnan(old_tag)):
            old_tag = ''
        
        # 태그 업데이트
        df.loc[target_index, 'tag'] = new_tag
        
        # CSV 파일에 저장
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        
        return {
            'success': True,
            'message': '출퇴근 기록이 성공적으로 업데이트되었습니다.',
            'record_id': int(record_id),
            'old_tag': old_tag,
            'new_tag': new_tag
        }
        
    except Exception as e:
        print(f"출퇴근 기록 업데이트 중 오류: {str(e)}")
        return {
            'success': False,
            'message': f'출퇴근 기록 업데이트 중 오류: {str(e)}'
        }