from pathlib import Path
from scripts.build.builder import build

base_dir = Path(__file__).parent.resolve()

if __name__ == '__main__':
    build(base_dir)