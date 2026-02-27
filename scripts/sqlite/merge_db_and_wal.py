import sqlite3
import os

def merge_db_and_wal(source_db_path, output_db_path):
    """
    Merges a .db and .db-wal by backing up the current state 
    of the source database into a new file.
    """
    
    # 1. Verify source files exist
    if not os.path.exists(source_db_path):
        print(f"Error: Source file '{source_db_path}' not found.")
        return

    # Note: We don't explicitly check for .db-wal. 
    # SQLite handles it automatically if it exists.

    # 2. Remove the output file if it already exists to avoid conflicts
    if os.path.exists(output_db_path):
        try:
            os.remove(output_db_path)
            print(f"Removed existing output file: {output_db_path}")
        except OSError as e:
            print(f"Error removing existing output file: {e}")
            return

    print("Starting merge process...")

    try:
        # 3. Connect to the source database
        # SQLite automatically reads the .db-wal file here
        source_conn = sqlite3.connect(source_db_path)
        
        # 4. Connect to the destination database
        dest_conn = sqlite3.connect(output_db_path)

        # 5. Use the backup API to copy the database
        # This copies the current state (DB + WAL data) to the new file
        source_conn.backup(dest_conn)
        
        print(f"Successfully merged '{source_db_path}' (and its WAL) into '{output_db_path}'")

    except sqlite3.Error as e:
        print(f"An SQLite error occurred: {e}")
    
    finally:
        # 6. Ensure connections are closed
        if 'dest_conn' in locals():
            dest_conn.close()
        if 'source_conn' in locals():
            source_conn.close()

if __name__ == "__main__":
    # Define paths
    INPUT_DB = "./data.db"
    OUTPUT_DB = "combined.db"
    
    merge_db_and_wal(INPUT_DB, OUTPUT_DB)