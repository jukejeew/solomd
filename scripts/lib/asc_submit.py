"""
Take an already-uploaded build to "Waiting for Review".

`submit-ios.sh` / `submit-mas.sh` put a binary in App Store Connect. That is
not a submission: the version has to exist, the build has to be attached to
it, the release notes have to be written, and the whole thing has to be handed
to review. That is what this does, and it is the part that used to mean
logging into a browser.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_api import Client, make_token  # noqa: E402

PLATFORMS = {"ios": "IOS", "macos": "MAC_OS", "mac": "MAC_OS"}


def wait_for_build(client, app, platform, cf_version, timeout_s):
    """A freshly uploaded build is PROCESSING for a while and cannot be
    attached to a version until it is VALID. Polling here is the difference
    between this script working right after an upload and only working if you
    happen to run it late enough."""
    deadline = time.time() + timeout_s
    reported = None
    while True:
        build = client.find_build(app, platform, cf_version)
        if build:
            state = build["attributes"].get("processingState")
            if state != reported:
                print(f"    build {cf_version}: {state}")
                reported = state
            if state == "VALID":
                return build
            if state in ("FAILED", "INVALID"):
                raise RuntimeError(
                    f"build {cf_version} came back {state} — check the email "
                    f"from Apple; it will not be attachable"
                )
        elif reported is None:
            print(f"    build {cf_version}: not visible yet")
            reported = "absent"
        if time.time() > deadline:
            raise RuntimeError(
                f"build {cf_version} was still {reported or 'absent'} after "
                f"{timeout_s}s. Uploads usually appear within 5-15 minutes; "
                f"raise --wait-build or re-run later."
            )
        time.sleep(20)


def main():
    p = argparse.ArgumentParser(description="Submit an uploaded build for App Store review.")
    p.add_argument("--platform", required=True, choices=sorted(PLATFORMS))
    p.add_argument("--version", required=True, help="marketing version, e.g. 4.12.0")
    p.add_argument("--build", help="CFBundleVersion of the upload (default: --version)")
    p.add_argument("--bundle-id", default=os.environ.get("ASC_BUNDLE_ID", "app.solomd"))
    p.add_argument("--notes-file", help="release notes; applied to every locale on the version")
    p.add_argument("--wait-build", type=int, default=1800,
                   help="seconds to wait for the build to finish processing (default 1800)")
    p.add_argument("--dry-run", action="store_true",
                   help="read the real state, print every write instead of making it")
    p.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = p.parse_args()

    platform = PLATFORMS[args.platform]
    cf_version = args.build or args.version

    key_id = os.environ.get("ASC_KEY_ID")
    issuer = os.environ.get("ASC_ISSUER_ID")
    key_path = os.environ.get("ASC_KEY_PATH")
    if not (key_id and issuer and key_path):
        sys.exit("ERROR: ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH must be set "
                 "(submitting for review has no Apple ID fallback — it is API-only).")

    notes = None
    if args.notes_file:
        with open(args.notes_file, encoding="utf-8") as fh:
            notes = fh.read().strip()
        if not notes:
            sys.exit(f"ERROR: {args.notes_file} is empty")

    client = Client(make_token(key_path, key_id, issuer), dry_run=args.dry_run)

    print(f"==> App {args.bundle_id}")
    app = client.app_id(args.bundle_id)
    print(f"    id {app}")

    print(f"==> Waiting for build {cf_version} ({platform}) to be processed")
    build = wait_for_build(client, app, platform, cf_version, args.wait_build)
    print(f"    build id {build['id']}")

    print(f"==> Version {args.version}")
    version = client.find_version(app, platform, args.version)
    if version:
        state = version["attributes"].get("appStoreState") or \
                version["attributes"].get("state")
        print(f"    exists, state {state}")
        if state in ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE",
                     "READY_FOR_SALE"):
            sys.exit(f"ERROR: {args.version} is already {state} — nothing to do.")
    else:
        version = client.create_version(app, platform, args.version)
        print(f"    created {version['id']}")

    if notes:
        locs = client.localizations(version["id"])
        print(f"==> Release notes -> {len(locs)} locale(s)")
        for loc in locs:
            client.set_whats_new(loc["id"], notes)
            print(f"    {loc['attributes'].get('locale')}")
    else:
        print("==> Release notes: left as-is (no --notes-file given)")

    print("==> Attaching build to version")
    client.attach_build(version["id"], build["id"])

    if not args.yes and not args.dry_run:
        ans = input(f"\nSubmit {args.bundle_id} {args.version} ({platform}) "
                    f"for Apple review? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            sys.exit("Aborted — the version and build are still linked, nothing submitted.")

    print("==> Submitting for review")
    client.submit_for_review(app, platform, version["id"])
    print(f"\nSubmitted. Track it at "
          f"https://appstoreconnect.apple.com/apps/{app}/distribution/"
          f"{'ios' if platform == 'IOS' else 'macos'}")


if __name__ == "__main__":
    main()
