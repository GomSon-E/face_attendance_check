# config.py - 애플리케이션 설정 및 상수

# 경로 설정 - 상대 경로 사용
DATA_DIR = "data_faces"
CSV_PATH = "face_encodings.csv"

# 얼굴 인식 설정
FACE_MODEL = "Facenet"  # 얼굴 인식 모델
DETECTOR_BACKEND = "mtcnn"  # 얼굴 감지 백엔드

# 경로 생성 시 슬래시 사용하는 함수
def create_path(*args):
    return '/'.join(args)

# 기타 설정
MIN_FACE_RATIO = 0.20  # 최소 얼굴 크기 비율
IMAGE_ENHANCEMENT = {
    "alpha": 1.5,  # 대비 증가 (1.0 = 원본)
    "beta": 30     # 밝기 증가 (-255 ~ 255)
}