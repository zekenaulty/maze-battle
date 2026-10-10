import os
import time
from pathlib import Path

# Define file extensions to exclude (non-text formats)
EXCLUDED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".zip", ".tar", ".gz", ".rar", ".7z", ".pdf", ".exe", ".dll", ".bin", ".iso"}

def is_text_file(file_path):
    """Check if a file is a text file based on its extension."""
    return file_path.suffix.lower() not in EXCLUDED_EXTENSIONS

def get_directory_structure(directory):
    """Recursively get the directory structure as a tree-like string."""
    structure = []
    for root, dirs, files in os.walk(directory):
        level = root.replace(directory, "").count(os.sep)
        indent = "  " * level
        structure.append(f"{indent}- {os.path.basename(root)}/")
        sub_indent = "  " * (level + 1)
        for file in files:
            structure.append(f"{sub_indent}- {file}")
    return "\n".join(structure)

def create_markdown_snapshot(directory):
    """Create a Markdown file containing the snapshot of the directory."""
    # Prepare file name with timestamp
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    markdown_filename = f"{Path(directory).name}.{timestamp}.md"
    markdown_filepath = Path(directory).parent / markdown_filename

    with open(markdown_filepath, "w", encoding="utf-8") as md_file:
        # Write directory structure at the top
        md_file.write("# Directory Snapshot\n\n")
        md_file.write("```\n")
        md_file.write(get_directory_structure(directory))
        md_file.write("\n```\n")

        # Traverse files and add their content
        for root, _, files in os.walk(directory):
            for file in files:
                file_path = Path(root) / file
                if is_text_file(file_path):
                    relative_path = file_path.relative_to(directory)
                    md_file.write(f"## {relative_path}\n\n")
                    md_file.write(f"**Path:** `{file_path}`\n\n")
                    md_file.write("```\n")
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            md_file.write(f.read())
                    except Exception as e:
                        md_file.write(f"Error reading file: {e}")
                    md_file.write("\n```\n")

    print(f"Markdown snapshot created: {markdown_filepath}")

# Specify the target directory (change as needed)
target_directory = "./battle"
create_markdown_snapshot(target_directory)

target_directory = "./core"
create_markdown_snapshot(target_directory)

target_directory = "./mazes"
create_markdown_snapshot(target_directory)

target_directory = "./ui"
create_markdown_snapshot(target_directory)
