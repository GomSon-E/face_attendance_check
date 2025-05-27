# config.py - 애플리케이션 설정 및 상수

# 경로 설정 - 상대 경로 사용
DATA_DIR = "data_faces"

# CSV 파일 경로들
EMPLOYEES_CSV_PATH = "employees.csv"
FACE_ENCODINGS_CSV_PATH = "face_encodings.csv" 
ATTENDANCE_CSV_PATH = "attendance_records.csv"

# 얼굴 인식 설정
FACE_MODEL = "ArcFace"  # 얼굴 인식 모델
DETECTOR_BACKEND = "mtcnn"  # 얼굴 감지 백엔드

# 경로 생성 시 슬래시 사용하는 함수
def create_path(*args):
    return '/'.join(args)

# 출퇴근 태그 시간 설정
ATTENDANCE_TIMES = {
    "CLOCK_IN": (5, 10),        # 출근: 05:00 ~ 10:00
    "LATE": (10, 12),           # 지각: 10:00 ~ 12:00
    "NONE": (12, 19),           # 태그 없음: 12:00 ~ 19:00
    "CLOCK_OUT": (19, 24),      # 퇴근: 19:00 ~ 00:00
    "EARLY_CLOCK_IN": (0, 5)    # 이른 출근: 00:00 ~ 05:00 (태그는 "")
}