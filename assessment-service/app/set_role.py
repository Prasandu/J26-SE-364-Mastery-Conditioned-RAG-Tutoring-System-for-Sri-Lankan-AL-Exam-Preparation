"""Give an account a role, or link a local account to its Supabase Auth user.

Run from the command line, never over HTTP - the same rule as app/create_admin.py.
With the shared Supabase sign-in, the first admin is made like this:

  1. Sign up / sign in once in the web app (frontend/). That makes a STUDENT account
     here, linked to the Supabase user.
  2. python -m app.set_role --email you@school.lk --role admin

After that, an admin can promote anyone else from the Users page.

  python -m app.set_role --email you@school.lk --link <supabase-user-uuid>

links an existing local account (e.g. one made by app/create_admin.py) to a Supabase
user, so that Supabase sign-in reaches it, role and history included. The UUID is in
the Supabase dashboard under Authentication -> Users.
"""

import argparse
import sys
from uuid import UUID

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, UserRole
from app.services.auth import normalize_email


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=[role.value for role in UserRole])
    parser.add_argument("--link", metavar="SUPABASE_USER_ID", help="Supabase Auth user id (UUID) to link")
    args = parser.parse_args()
    if args.role is None and args.link is None:
        parser.error("give --role, --link, or both")

    link: str | None = None
    if args.link is not None:
        try:
            link = str(UUID(args.link))
        except ValueError:
            parser.error("--link must be the Supabase user's UUID")

    email = normalize_email(args.email)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"No account with {email}. Sign in once in the web app first.", file=sys.stderr)
            raise SystemExit(1)
        if link is not None:
            owner = db.scalar(select(User).where(User.supabase_user_id == link))
            if owner is not None and owner.id != user.id:
                print(f"That Supabase user is already linked to {owner.email}.", file=sys.stderr)
                raise SystemExit(1)
            user.supabase_user_id = link
        if args.role is not None:
            user.role = UserRole(args.role)
        db.commit()
        print(f"{email}: role={user.role.value}, supabase_user_id={user.supabase_user_id or '-'}")


if __name__ == "__main__":
    main()
