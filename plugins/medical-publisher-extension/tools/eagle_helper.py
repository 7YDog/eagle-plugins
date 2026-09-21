import glob, os, base64, json, subprocess, urllib.request

EAGLE_LIB_DIR = "/Users/lissmac/Documents/医疗 IP 运营.library/images"
API_KEY = "apikey_2569ff5869069cf4464bb88e210e193d278_8f00af48431c2d2b71dc79a3b6d24d454c8578c6c5597c04e52e3a7810f9c831"

TAGS_XU = "医生日常 脑积水 脑脊液 我要上热门 硬核科普健康行动"
TAGS_ZHOU_MIANJI = "面肌痉挛 我要上热门 眼皮跳 硬核科普健康行动"
TAGS_ZHOU_MIANTAN = "面瘫 面瘫后遗症 我要上热门 硬核科普健康行动"

def find_eagle_thumbnail(video_base_name):
    # Search for matching folder
    pattern = f"{EAGLE_LIB_DIR}/*/{video_base_name}.*"
    matches = glob.glob(pattern)
    for m in matches:
        if m.endswith(".mp4") or m.endswith(".mov"):
            info_dir = os.path.dirname(m)
            thumbs = glob.glob(f"{info_dir}/*_thumbnail.*")
            if thumbs:
                return thumbs[0]
    return None

def classify_with_jev(title):
    req_body = {
        "model": "jev-latest",
        "state": title,
        "questions": {
            "disease": {
                "type": "choice",
                "instructions": "该视频标题更符合哪个疾病领域？",
                "criteria": {
                    "mianjijingluan": "面肌痉挛：眼皮跳、嘴角跳动抽搐、阵发性肌肉痉挛",
                    "miantan": "面瘫：嘴歪眼斜、口角歪斜、面瘫后遗症、面部神经无力瘫痪"
                }
            }
        }
    }
    req = urllib.request.Request(
        "https://api.typesafe.ai/v1/systemone",
        data=json.dumps(req_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("answers", {}).get("disease", {})

print("Flow helper ready.")
