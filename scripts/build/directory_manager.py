import shutil
import subprocess
import sys
from pathlib import Path

class DirectoryManager:
    def clean(self, directories):
        """
        Clean specific directories. 
        If they don't exist, simply skip them without error.

        Args:
            directories (list[str]): A list of folder names to be removed.

        Example:
            builder.clean(["/workspace/dist", "/workspace/build"])
            # Removes dist and build
        """
        print("\n>>> Task: Cleaning Directories")
        for target in directories:
            if target.exists() and target.is_dir():
                # We use shutil.rmtree to remove the folder and all its contents
                shutil.rmtree(target)
                print(f"Removed: {target}")
            else:
                print(f"Skipped (not found): {target}")

    def run(self, work_dir, command):
        """
        Execute commands.
        check=True ensures a CalledProcessError is raised if the command fails.

        Args:
            work_dir (Path | str): The directory where the command should be executed.
            command (str): The shell command to run.

        Example:
            builder.run(Path("/project"), "npm install")
        """
        print(f"\n>>> Task: Running Command -> '{command}' in {work_dir}")
        cwd_path = work_dir
        
        # subprocess.run will raise an exception if the return code is non-zero
        subprocess.run(command, shell=True, cwd=cwd_path, check=True)

    def copy(self, src_path, dst_path):
        """
        Copy files or folders.

        Args:
            src_path (Path): Source file or directory path.
            dst_path (Path): Destination path. 

        Details:
            - Directory copy: Recursively copies the 'src_path' directory to 'dst_path'.
              'dst_path' will be the NEW directory name.
              Example: copy('foo', 'bar') -> creates 'bar' containing contents of 'foo'.
              Does NOT create 'bar/foo'.
              If 'dst_path' already exists, it is REPLACED (deleted then copied).
            - File copy: Copies the file 'src_path' to 'dst_path'.

        Example:
            # Copy contents of 'src/assets' to new folder 'dist/assets'
            # If 'dist/assets' existed, it is replaced.
            builder.copy(Path("src/assets"), Path("dist/assets"))
        """

        print(f"\n>>> Task: Copying/Renaming -> {src_path} to {dst_path}")

        # Ensure the destination's parent directory exists (auto-create)
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.is_dir():
            # If destination exists, remove it first to ensure clean copy (resembling 'cp -r' behavior without nesting issues)
            if dst_path.exists():
                print(f"Destination {dst_path} exists, removing it before copy.")
                shutil.rmtree(dst_path)
            shutil.copytree(src_path, dst_path)
        else:
            # copy2 preserves metadata for files
            shutil.copy2(src_path, dst_path)

    def move(self, src_path, dst_path):
        """
        Move files or folders.

        Args:
            src_path (Path): Source file or directory path.
            dst_path (Path): Destination path.

        Details:
            - Moves 'src_path' to 'dst_path'.
            - 'dst_path' becomes the new name of 'src_path'.
            - Example: move('build/output', 'dist/v1') -> 'dist/v1' now contains what 'build/output' had.
            - Does NOT nest: If 'dist/v1' existed, it is deleted first, then 'move' occurs.
              This prevents 'dist/v1/output' creation.

        Example:
            # Move 'temp_build' folder to 'final_build' (renaming)
            builder.move(Path("temp_build"), Path("final_build"))
        """
        print(f"\n>>> Task: Moving -> {src_path} to {dst_path}")

        # Ensure the destination's parent directory exists (auto-create)
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        # Fix: shutil.move nests if dst exists. To ensure "Rename/Move To" semantics, we clear dst first.
        if dst_path.exists():
            print(f"Destination {dst_path} exists, removing it before move to avoid nesting.")
            if dst_path.is_dir():
                shutil.rmtree(dst_path)
            else:
                dst_path.unlink()

        shutil.move(src_path, dst_path)

    def safe_copy(self, src_path, dst_path):
        """
        Copy files or folders ONLY if destination does not exist.
        If destination exists, aborts the script.

        Args:
            src_path (Path): Source file or directory path.
            dst_path (Path): Destination path. 
        """
        print(f"\n>>> Task: Safe Copying -> {src_path} to {dst_path}")
        if dst_path.exists():
            print(f"ERROR: Destination {dst_path} already exists. Aborting build.")
            sys.exit(1)

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        if src_path.is_dir():
            shutil.copytree(src_path, dst_path)
        else:
            shutil.copy2(src_path, dst_path)

    def safe_move(self, src_path, dst_path):
        """
        Move files or folders ONLY if destination does not exist.
        If destination exists, aborts the script.

        Args:
            src_path (Path): Source file or directory path.
            dst_path (Path): Destination path.
        """
        print(f"\n>>> Task: Safe Moving -> {src_path} to {dst_path}")
        if dst_path.exists():
            print(f"ERROR: Destination {dst_path} already exists. Aborting build.")
            sys.exit(1)
        
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(src_path, dst_path)

    def check_exists(self, path):
        """
        Check if a file or directory exists.
        If it does not exist, print an error and exit the script.

        Args:
            path (Path | str): The path to check.
        """
        target = Path(path)
        print(f"\n>>> Task: Checking existence -> {target}")
        if not target.exists():
            print(f"ERROR: Required file or directory not found: {target}")
            print("Please ensure all dependencies and configuration files are ready.")
            sys.exit(1)
        else:
            print(f"Verified: {target} exists.")

    def retain_only_extensions(self, directory, extension):
        """
        Delete all files in a directory except those with the specified extension.

        Args:
            directory (Path | str): The target directory to filter.
            extension (str): The file extension to keep (e.g., '.py'). Files with other extensions will be deleted.

        Example:
            builder.retain_only_extensions(Path("dist"), ".js")
            # Deletes all files in 'dist' that do not end with .js
        """
        target = Path(directory)
        print(f"\n>>> Task: Retaining only {extension} files in {target}")

        if not target.exists() or not target.is_dir():
            print(f"Skipped (not found or not a dir): {target}")
            return

        removed_count = 0
        for item in target.iterdir():
            if item.is_file():
                if item.suffix.lower() != extension.lower():
                    try:
                        item.unlink()
                        removed_count += 1
                    except Exception as e:
                        print(f"Failed to delete {item}: {e}")

        print(f"Removed {removed_count} files.")

    def delete(self, path):
        """
        Smart delete: removes a file or directory recursively given a path.

        Args:
            path (Path | str): The absolute or relative path to delete.

        Example:
            builder.delete(Path("dist/temp.txt"))
        """
        target = Path(path)
        print(f"\n>>> Task: Smart Deleting -> {target}")

        if not target.exists():
            print(f"Skipped (not found): {target}")
            return

        try:
            if target.is_dir():
                shutil.rmtree(target)
                print(f"Removed directory: {target}")
            elif target.is_file():
                target.unlink()
                print(f"Removed file: {target}")
        except Exception as e:
            print(f"Failed to delete {target}: {e}")