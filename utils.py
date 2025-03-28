# utils.py - 일반 유틸리티 함수
import os
import re
import hashlib
import pandas as pd
import numpy as np
import json
from config import CSV_PATH

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

def save_to_csv(name, image_path, encoding_vector, timestamp):
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