# utils.py - 일반 유틸리티 함수
import os
import re
import hashlib
import pandas as pd
import numpy as np
import json
import datetime
from config import CSV_PATH, ATTENDANCE_CSV_PATH, ATTENDANCE_TIMES

def init_csv_file():
    """CSV 파일 초기화 함수"""
    if not os.path.exists(CSV_PATH):
        df = pd.DataFrame(columns=['name', 'image_path', 'encoding', 'timestamp'])
        df.to_csv(CSV_PATH, index=False)
        print(f"CSV 파일 '{CSV_PATH}'이 생성되었습니다.")

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

def vector_to_string(vector):
    """벡터를 문자열로 변환"""
    return json.dumps(vector.tolist())

def string_to_vector(string):
    """문자열을 벡터로 변환"""
    return np.array(json.loads(string))

def get_face_vector_from_csv(person_name):
    """CSV에서 특정 인물의 얼굴 벡터 가져오기"""
    try:
        df = pd.read_csv(CSV_PATH)
        # 이름으로 필터링
        person_data = df[df['name'] == person_name]
        
        if person_data.empty:
            return None
            
        # 가장 최근 데이터 사용
        latest_data = person_data.iloc[-1]
        
        # 인코딩 문자열을 벡터로 변환
        encoding_vector = string_to_vector(latest_data['encoding'])
        
        return encoding_vector
    except Exception as e:
        print(f"얼굴 벡터 가져오기 오류: {str(e)}")
        return None

def save_to_csv(name, department, position, employeeId, image_path, encoding_vector, timestamp):
    """데이터를 CSV에 저장"""
    try:
        try:
            df = pd.read_csv(CSV_PATH)
        except Exception as e:
            print(f"CSV 파일 읽기 오류, 새 DataFrame 생성: {e}")
            df = pd.DataFrame(columns=['name', 'image_path', 'encoding', 'timestamp'])
        
        # 벡터를 문자열로 변환
        encoding_str = vector_to_string(encoding_vector)
        
        new_row = {
            'name': name,
            'department': department,
            'position': position,
            'employeeId': employeeId,
            'image_path': image_path,
            'encoding': encoding_str,
            'timestamp': timestamp
        }
        
        # pd.concat 사용
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df.to_csv(CSV_PATH, index=False)
        return True
    except Exception as e:
        print(f"CSV 저장 오류: {str(e)}")
        return False
    
def init_attendance_csv():
    """출퇴근 기록 CSV 파일 초기화"""
    if not os.path.exists(ATTENDANCE_CSV_PATH):
        df = pd.DataFrame(columns=['name', 'date', 'time', 'tag'])
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        print(f"출퇴근 기록 CSV 파일 '{ATTENDANCE_CSV_PATH}'이 생성되었습니다.")

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

def record_attendance(name):
    """출퇴근 기록 저장"""
    try:
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        tag = determine_attendance_tag()
        
        # CSV 파일 읽기 또는 생성
        try:
            df = pd.read_csv(ATTENDANCE_CSV_PATH)
        except Exception as e:
            print(f"CSV 파일 읽기 오류, 새 DataFrame 생성: {e}")
            df = pd.DataFrame(columns=['name', 'date', 'time', 'tag'])
        
        # 새 기록 추가
        new_row = {
            'name': name,
            'date': date_str,
            'time': time_str,
            'tag': tag
        }
        
        # pd.concat 사용
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        
        return {
            'success': True,
            'name': name,
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

def get_attendance_records(filters=None):
    """출퇴근 기록 데이터 조회"""
    
    if not os.path.exists(ATTENDANCE_CSV_PATH):
        return []
    
    try:
        # CSV 파일 읽기
        df = pd.read_csv(ATTENDANCE_CSV_PATH)
        
        # 누락된 값 처리
        df = df.fillna('')
        
        # 필터링 적용
        if filters:
            # 이름 필터
            if 'name' in filters and filters['name']:
                df = df[df['name'].str.contains(filters['name'], case=False)]
            
            # 날짜 필터 (시작일)
            if 'start_date' in filters and filters['start_date']:
                df = df[df['date'] >= filters['start_date']]
            
            # 날짜 필터 (종료일)
            if 'end_date' in filters and filters['end_date']:
                df = df[df['date'] <= filters['end_date']]
            
            # 태그 필터
            if 'tag' in filters and filters['tag']:
                if filters['tag'] == 'empty':
                    # 빈 태그 필터링
                    df = df[df['tag'] == '']
                else:
                    df = df[df['tag'] == filters['tag']]
        
        # 날짜와 시간 기준으로 정렬 (최신순)
        df = df.sort_values(by=['date', 'time'], ascending=[False, False])
        
        # NaN, Infinity 값을 안전하게 처리
        def safe_value(val):
            if pd.isna(val) or (isinstance(val, float) and np.isnan(val)):
                return ''
            elif isinstance(val, float) and np.isinf(val):
                return 'Infinity' if val > 0 else '-Infinity'
            return val
        
        # pandas에서 안전하게 처리
        df_safe = df.copy()
        for col in df_safe.columns:
            df_safe[col] = df_safe[col].apply(safe_value)
        
        # 딕셔너리 리스트로 변환
        records = df_safe.to_dict('records')
        
        return records
    except Exception as e:
        print(f"출퇴근 기록 조회 중 오류: {str(e)}")
        return []

def update_attendance_record(record_id, new_tag):
    """출퇴근 기록의 태그 업데이트"""
    try:
        if not os.path.exists(ATTENDANCE_CSV_PATH):
            return {
                'success': False,
                'message': '출퇴근 기록 파일이 존재하지 않습니다.'
            }
        
        # CSV 파일 읽기
        df = pd.read_csv(ATTENDANCE_CSV_PATH)
        
        # 누락된 값 처리
        df = df.fillna('')
        
        # 인덱스 유효성 검사
        if record_id < 0 or record_id >= len(df):
            return {
                'success': False,
                'message': f'ID {record_id}의 출퇴근 기록을 찾을 수 없습니다.'
            }
        
        # 이전 값 저장 (안전하게 처리)
        old_tag = df.loc[record_id, 'tag']
        if pd.isna(old_tag) or (isinstance(old_tag, float) and np.isnan(old_tag)):
            old_tag = ''
        
        # 태그 업데이트
        df.loc[record_id, 'tag'] = new_tag
        
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