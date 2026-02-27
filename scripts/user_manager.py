#!/usr/bin/env python3
import psycopg2
import getpass
import sys
import os

# Try importing argon2, handle missing dependency
try:
    from argon2 import PasswordHasher
    ph = PasswordHasher()
except ImportError:
    print("Error: 'argon2-cffi' library is required.")
    print("Please install it: pip install argon2-cffi or sudo apt install python3-argon2 python3-cffi")
    sys.exit(1)

from psycopg2 import Error

# Database connection parameters
DB_CONFIG = {
    "host": "localhost",
    "database": "tradeflow",
    "user": "postgres",
    "password": "postgres",
    "port": 5432
}

def get_db_connection():
    """Establish and return a database connection."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Error connecting to database: {e}")
        return None

def hash_password(password):
    """Hash a password using Argon2."""
    try:
        return ph.hash(password)
    except Exception as e:
        print(f"Error hashing password: {e}")
        return None

def create_user():
    """Interactive function to create a new user."""
    print("\n" + "-"*30)
    print(" CREATE NEW USER")
    print("-" * 30)
    
    # Get username
    while True:
        username = input("Enter username: ").strip()
        if username:
            break
        print("Username cannot be empty.")

    # Get password (Plaintext or Hash)
    password_hash = None
    while True:
        pwd_type = input("Enter password type (1: Plaintext, 2: Pre-hashed Hash) [1]: ").strip() or '1'
        
        if pwd_type == '1':
            # Plaintext
            while True:
                password = getpass.getpass("Enter password: ").strip()
                if not password:
                    print("Password cannot be empty.")
                    continue
                
                confirm_password = getpass.getpass("Confirm password: ").strip()
                if password == confirm_password:
                    # Hash immediately
                    password_hash = hash_password(password)
                    break
                print("Passwords do not match. Please try again.")
            if password_hash: break

        elif pwd_type == '2':
            # Pre-hashed
            while True:
                p_hash = input("Enter password hash: ").strip()
                if not p_hash:
                    print("Hash cannot be empty.")
                    continue
                password_hash = p_hash
                break
            break
        else:
            print("Invalid selection.")

    # Get other fields
    role = input("Enter role (editor/reader, default: editor): ").strip()
    if not role:
        role = 'editor'
        
    display_name = input("Enter display name (optional): ").strip()
    if not display_name:
        display_name = None
        
    enabled_input = input("Enable user? (Y/n): ").strip().lower()
    enabled = enabled_input != 'n'

    conn = get_db_connection()
    if not conn:
        return

    cursor = None
    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO users (username, password_hash, role, display_name, enabled, created_at, last_password_change)
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        cursor.execute(query, (username, password_hash, role, display_name, enabled))
        conn.commit()
        print(f"\n[Success] User '{username}' created successfully.")
    except Error as e:
        if conn:
            conn.rollback()
        print(f"\n[Error] Failed to create user: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def read_user():
    """Interactive function to read user details."""
    print("\n" + "-"*30)
    print(" READ USER INFO")
    print("-" * 30)
    
    username = input("Enter username to search: ").strip()
    if not username:
        print("Username cannot be empty.")
        return

    conn = get_db_connection()
    if not conn:
        return

    cursor = None
    try:
        cursor = conn.cursor()
        query = "SELECT username, role, display_name, enabled, created_at FROM users WHERE username = %s"
        cursor.execute(query, (username,))
        user = cursor.fetchone()

        if user:
            print("\nUser Found:")
            print(f"Username     : {user[0]}")
            print(f"Role         : {user[1]}")
            print(f"Display Name : {user[2]}")
            print(f"Enabled      : {user[3]}")
            print(f"Created At   : {user[4]}")
        else:
            print(f"\n[Info] User '{username}' not found.")
    except Error as e:
        print(f"[Error] Reading user: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def update_user():
    """Interactive function to update specific fields of a user."""
    print("\n" + "-"*30)
    print(" UPDATE USER")
    print("-" * 30)
    
    username = input("Enter username to update: ").strip()
    if not username:
        print("Username cannot be empty.")
        return

    # Check existence
    conn = get_db_connection()
    if not conn:
        return

    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE username = %s", (username,))
        result = cursor.fetchone()
        
        if not result:
            print(f"\n[Error] User '{username}' not found.")
            return

        print("\nWhich field would you like to update?")
        print("1. Password")
        print("2. Role")
        print("3. Display Name")
        print("4. Enabled Status")
        print("5. Cancel")
        
        choice = input("Enter choice (1-5): ").strip()

        if choice == '5':
            print("Operation cancelled.")
            return

        update_sql = ""
        update_val = None

        if choice == '1':
            update_sql = "UPDATE users SET password_hash = %s, last_password_change = CURRENT_TIMESTAMP WHERE username = %s"
            while True:
                pwd_type = input("Enter password type (1: Plaintext, 2: Pre-hashed Hash) [1]: ").strip() or '1'
                
                if pwd_type == '1':
                    new_pass = getpass.getpass("Enter new password: ").strip()
                    if not new_pass:
                        print("Password cannot be empty.")
                        continue
                    confirm_pass = getpass.getpass("Confirm password: ").strip()
                    if new_pass != confirm_pass:
                        print("Passwords do not match.")
                        continue
                        
                    update_val = hash_password(new_pass)
                    if not update_val:
                        print("Hashing failed.")
                        return 
                    break
                    
                elif pwd_type == '2':
                    new_hash = input("Enter password hash: ").strip()
                    if not new_hash:
                        print("Hash cannot be empty.")
                        continue
                    update_val = new_hash
                    break
                else:
                    print("Invalid choice.")
            
        elif choice == '2':
            update_val = input("Enter new role: ").strip()
            if not update_val: 
                 print("Role cannot be empty")
                 return
            update_sql = "UPDATE users SET role = %s WHERE username = %s"
            
        elif choice == '3':
            update_val = input("Enter new display name: ").strip()
            update_sql = "UPDATE users SET display_name = %s WHERE username = %s"
            
        elif choice == '4':
            status_input = input("Enable user? (y/n, default: y): ").strip().lower()
            update_val = status_input != 'n'
            update_sql = "UPDATE users SET enabled = %s WHERE username = %s"
            
        else:
            print("Invalid choice.")
            return

        cursor.execute(update_sql, (update_val, username))
        conn.commit()
        print(f"\n[Success] User '{username}' updated successfully.")
            
    except Error as e:
        if conn:
            conn.rollback()
        print(f"[Error] Updating user: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def delete_user():
    """Interactive function to delete a user."""
    print("\n" + "-"*30)
    print(" DELETE USER")
    print("-" * 30)
    
    username = input("Enter username to delete: ").strip()
    if not username:
        print("Username cannot be empty.")
        return
    
    confirm = input(f"Are you sure you want to delete user '{username}'? (type 'yes' to confirm): ").strip().lower()
    if confirm != 'yes':
        print("Deletion cancelled.")
        return

    conn = get_db_connection()
    if not conn:
        return

    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE username = %s", (username,))
        
        if cursor.rowcount == 0:
            print(f"\n[Error] User '{username}' not found.")
        else:
            conn.commit()
            print(f"\n[Success] User '{username}' deleted successfully.")
    except Error as e:
        if conn:
            conn.rollback()
        print(f"[Error] Deleting user: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def main_menu():
    """Main menu loop for the user management tool."""
    while True:
        print("\n" + "="*40)
        print("   USER MANAGEMENT CLI TOOL")
        print("="*40)
        print("1. Create User (C)")
        print("2. Read User (R)")
        print("3. Update User (U)")
        print("4. Delete User (D)")
        print("5. Quit (Q)")
        print("-" * 40)
        
        choice = input("Select operation: ").strip().lower()
        
        if choice in ['1', 'c']:
            create_user()
        elif choice in ['2', 'r']:
            read_user()
        elif choice in ['3', 'u']:
            update_user()
        elif choice in ['4', 'd']:
            delete_user()
        elif choice in ['5', 'q', 'exit', 'quit']:
            print("Exiting...")
            break
        else:
            print("Invalid selection. Please try again.")

if __name__ == "__main__":
    main_menu()
