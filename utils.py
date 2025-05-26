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

def get_person_info_from_csv(person_name):
    """CSV에서 특정 인물의 정보 가져오기 (부서, 직책, 사번 포함)"""
    try:
        df = pd.read_csv(CSV_PATH)
        # 이름으로 필터링
        person_data = df[df['name'] == person_name]
        
        if person_data.empty:
            return None
            
        # 가장 최근 데이터 사용
        latest_data = person_data.iloc[-1]
        
        return {
            'name': latest_data.get('name', ''),
            'department': latest_data.get('department', ''),
            'position': latest_data.get('position', ''),
            'employeeId': latest_data.get('employeeId', '')
        }
    except Exception as e:
        print(f"인물 정보 가져오기 오류: {str(e)}")
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
    """출퇴근 기록 CSV 파일 초기화 (부서, 직책, 사번 컬럼 추가)"""
    if not os.path.exists(ATTENDANCE_CSV_PATH):
        df = pd.DataFrame(columns=['record_id', 'name', 'department', 'position', 'employeeId', 'date', 'time', 'tag'])
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        print(f"출퇴근 기록 CSV 파일 '{ATTENDANCE_CSV_PATH}'이 생성되었습니다.")
    else:
        # 기존 파일이 있으면 컬럼 확인 및 업데이트
        try:
            df = pd.read_csv(ATTENDANCE_CSV_PATH)
            expected_columns = ['record_id', 'name', 'department', 'position', 'employeeId', 'date', 'time', 'tag']
            
            # 누락된 컬럼 추가
            for col in expected_columns:
                if col not in df.columns:
                    df[col] = ''
                    print(f"출퇴근 기록 CSV에 '{col}' 컬럼 추가됨")
            
            # record_id가 없거나 잘못된 경우 재생성
            if 'record_id' not in df.columns or df['record_id'].isna().any():
                df['record_id'] = df.index
                print("출퇴근 기록 CSV에 record_id 재생성됨")
            
            # 컬럼 순서 정렬
            df = df[expected_columns]
            df.to_csv(ATTENDANCE_CSV_PATH, index=False)
            print("출퇴근 기록 CSV 컬럼 구조 업데이트 완료")
        except Exception as e:
            print(f"출퇴근 기록 CSV 업데이트 중 오류: {str(e)}")

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
    """출퇴근 기록 저장 (부서, 직책, 사번 정보 포함)"""
    try:
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        tag = determine_attendance_tag()
        
        # 사용자 정보 가져오기
        person_info = get_person_info_from_csv(name)
        if person_info:
            department = person_info['department']
            position = person_info['position']
            employeeId = person_info['employeeId']
        else:
            department = ''
            position = ''
            employeeId = ''
            print(f"경고: {name}의 인물 정보를 찾을 수 없어 빈 값으로 설정됨")
        
        # CSV 파일 읽기 또는 생성
        try:
            df = pd.read_csv(ATTENDANCE_CSV_PATH)
        except Exception as e:
            print(f"CSV 파일 읽기 오류, 새 DataFrame 생성: {e}")
            df = pd.DataFrame(columns=['record_id', 'name', 'department', 'position', 'employeeId', 'date', 'time', 'tag'])
        
        # record_id 생성 (연속적인 고유 ID)
        if df.empty:
            new_record_id = 0
        else:
            # 기존 최대 record_id + 1
            max_id = df['record_id'].max() if 'record_id' in df.columns and not df['record_id'].isna().all() else -1
            new_record_id = int(max_id) + 1
        
        # 새 기록 추가
        new_row = {
            'record_id': new_record_id,
            'name': str(name) if name is not None else '',
            'department': str(department) if department is not None else '',
            'position': str(position) if position is not None else '',
            'employeeId': str(employeeId) if employeeId is not None else '',
            'date': date_str,
            'time': time_str,
            'tag': str(tag) if tag is not None else ''
        }
        
        # pd.concat 사용
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df.to_csv(ATTENDANCE_CSV_PATH, index=False)
        
        # 안전한 값으로 반환
        return {
            'success': True,
            'record_id': int(new_record_id),
            'name': str(name) if name is not None else '',
            'department': str(department) if department is not None else '',
            'position': str(position) if position is not None else '',
            'employeeId': str(employeeId) if employeeId is not None else '',
            'date': date_str,
            'time': time_str,
            'tag': str(tag) if tag is not None else ''
        }
    except Exception as e:
        print(f"출퇴근 기록 저장 오류: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def get_attendance_records(filters=None):
    """출퇴근 기록 데이터 조회 (record_id 포함)"""
    
    if not os.path.exists(ATTENDANCE_CSV_PATH):
        return []
    
    try:
        # CSV 파일 읽기
        df = pd.read_csv(ATTENDANCE_CSV_PATH)
        
        # 누락된 값 처리
        df = df.fillna('')
        
        # record_id가 없으면 생성
        if 'record_id' not in df.columns:
            df['record_id'] = df.index
            df.to_csv(ATTENDANCE_CSV_PATH, index=False)
            print("출퇴근 기록에 record_id 컬럼 추가됨")
        
        # 필터링 적용
        if filters:
            # 이름 필터
            if 'name' in filters and filters['name']:
                df = df[df['name'].str.contains(filters['name'], case=False, na=False)]
            
            # 부서 필터
            if 'department' in filters and filters['department']:
                df = df[df['department'].str.contains(filters['department'], case=False, na=False)]
            
            # 직급 필터
            if 'position' in filters and filters['position']:
                df = df[df['position'].str.contains(filters['position'], case=False, na=False)]
            
            # 사번 필터
            if 'employeeId' in filters and filters['employeeId']:
                df = df[df['employeeId'].str.contains(filters['employeeId'], case=False, na=False)]
            
            # 날짜 필터 수정 (문자열 비교에서 datetime 비교로 변경)
            if 'start_date' in filters and filters['start_date']:
                try:
                    start_date = pd.to_datetime(filters['start_date']).date()
                    df['date_parsed'] = pd.to_datetime(df['date'], errors='coerce').dt.date
                    df = df[df['date_parsed'] >= start_date]
                    print(f"시작일 필터 적용: {start_date} 이후")
                except Exception as e:
                    print(f"시작일 파싱 오류: {e}")
            
            if 'end_date' in filters and filters['end_date']:
                try:
                    end_date = pd.to_datetime(filters['end_date']).date()
                    if 'date_parsed' not in df.columns:
                        df['date_parsed'] = pd.to_datetime(df['date'], errors='coerce').dt.date
                    df = df[df['date_parsed'] <= end_date]
                    print(f"종료일 필터 적용: {end_date} 이전")
                except Exception as e:
                    print(f"종료일 파싱 오류: {e}")
            
            # 임시 컬럼 제거
            if 'date_parsed' in df.columns:
                df = df.drop('date_parsed', axis=1)
            
            # 태그 필터
            if 'tag' in filters and filters['tag']:
                if filters['tag'] == 'empty':
                    # 빈 태그 필터링
                    df = df[df['tag'] == '']
                else:
                    df = df[df['tag'] == filters['tag']]
        
        # 디버깅을 위한 로그
        if filters:
            print(f"필터 적용 후 기록 수: {len(df)}")
            if len(df) > 0:
                print(f"날짜 범위: {df['date'].min()} ~ {df['date'].max()}")
        
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
    """출퇴근 기록의 태그 업데이트 (record_id 기반으로 수정)"""
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
        
        # record_id로 해당 기록 찾기
        if 'record_id' not in df.columns:
            return {
                'success': False,
                'message': '출퇴근 기록에 record_id가 없습니다. 시스템 관리자에게 문의하세요.'
            }
        
        # record_id 기반으로 행 찾기
        target_rows = df[df['record_id'] == record_id]
        
        if target_rows.empty:
            return {
                'success': False,
                'message': f'record_id {record_id}에 해당하는 출퇴근 기록을 찾을 수 없습니다.'
            }
        
        # 첫 번째 일치하는 행의 인덱스 가져오기
        target_index = target_rows.index[0]
        
        # 이전 값 저장 (안전하게 처리)
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