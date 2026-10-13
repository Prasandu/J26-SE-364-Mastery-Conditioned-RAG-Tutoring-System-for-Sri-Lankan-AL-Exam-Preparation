"""Create the very first admin account. Run once, from the command line, never over
HTTP - there is no route that can create an admin, by design (see app/models/users.py).

  python -m app.create_admin --email you@school.lk --name "Your Name"

Prompts for the password rather than taking it as an argument, so it never ends up
in shell history or a process list.
"""

import argparse
import sys
from getpass import getpass

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, UserRole
from app.services.auth import hash_password, normalize_email


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()

    password = getpass("Password: ")
    confirm = getpass("Confirm password: ")
    if password != confirm:
        print("Passwords did not match.", file=sys.stderr)
        raise SystemExit(1)
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        raise SystemExit(1)

    email = normalize_email(args.email)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)) is not None:
            print(f"An account with {email} already exists.", file=sys.stderr)
            raise SystemExit(1)

        user = User(
            email=email,
            name=args.name.strip(),
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
        )
        db.add(user)
        db.commit()

    print(f"Created admin account for {email}.")


if __name__ == "__main__":
    main()
