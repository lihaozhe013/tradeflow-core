# python sort_i18n_keys.py ./locales/en/en-US.json ./locales/zh/zh-CN.json ./locales/ko/ko-Kr.json --recursive
import json
import os
from pathlib import Path
from typing import Any

base_dir = Path(__file__).parent.resolve()

files_to_process = [
    base_dir / 'locales' / 'en' / 'en_US.json', 
    base_dir / 'locales' / 'zh' / 'zh-CN.json', 
    base_dir / 'locales' / 'ko' / 'ko-Kr.json'
]

def sort_dict_recursively(data: Any) -> Any:
    """
    Recursively sorts the keys of a dictionary and its nested dictionaries.

    :param data: The data structure (Dict or other).
    :return: The data structure with sorted dictionary keys.
    """
    # Check if the data is a dictionary
    if isinstance(data, dict):
        # Sort the items based on the key (item[0])
        sorted_items = sorted(data.items())
        
        # Create a new dictionary, and recursively sort the values
        return {
            key: sort_dict_recursively(value)
            for key, value in sorted_items
        }
    
    # Check if the data is a list or tuple (to handle arrays of objects)
    elif isinstance(data, list) or isinstance(data, tuple):
        # Apply the sorting function to each element in the list/tuple
        return [sort_dict_recursively(item) for item in data]
    
    # Return all other types (strings, numbers, booleans) unchanged
    return data

def sort_json_file(file_path: str, indent: int = 4, recursive: bool = False):
    """
    Reads the specified JSON file, sorts its keys (either top-level or recursively), 
    and writes the content back to the file.

    :param file_path: The path to the JSON file.
    :param indent: The number of spaces for indentation in the output JSON.
    :param recursive: If True, sort keys in all nested objects.
    """
    # Check if the file exists
    if not os.path.exists(file_path):
        print(f"Error: File not found -> {file_path}")
        return

    print(f"Processing file: {file_path}")

    try:
        # 1. Read JSON data
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

    except json.JSONDecodeError:
        print(f"Error: File content is not valid JSON format -> {file_path}")
        return
    except Exception as e:
        print(f"Error: An unexpected error occurred while reading the file -> {e}")
        return

    # 2. Sort Data
    sorted_data: Any

    if isinstance(data, dict):
        if recursive:
            # Recursively sort keys in all nested dictionaries
            sorted_data = sort_dict_recursively(data)
            print("All keys (including nested ones) have been sorted alphabetically.")
        else:
            # Only sort the top-level keys
            sorted_data = dict(sorted(data.items()))
            print("Top-level keys have been sorted alphabetically.")
    else:
        # If the top level is not a dictionary (e.g., a list), skip sorting
        sorted_data = data
        print("Warning: File top level is not a dictionary. Skipping key sorting.")


    # 3. Write back to file
    try:
        # Use 'w' mode to overwrite the original file
        with open(file_path, 'w', encoding='utf-8') as f:
            # ensure_ascii=False allows writing non-ASCII characters (like Chinese)
            # indent=indent is for pretty printing
            json.dump(sorted_data, f, ensure_ascii=False, indent=indent)

        print(f"✨ Success: File organized and saved -> {file_path}")

    except Exception as e:
        print(f"Error: An unexpected error occurred while writing to the file -> {e}")

def main():
    """
    Main function to sort predefined i18n files recursively.
    """
    # List of files to process

    # Loop through and process all specified files
    for file_path in files_to_process:
        # Pass the recursive flag to the sorting function
        # Convert Path object to string just in case, though usually handled
        sort_json_file(str(file_path), indent=2, recursive=True)
        print("-" * 40) # Separator

if __name__ == "__main__":
    main()