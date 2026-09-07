# Microsoft Partner Center

Product `9NXGHK2LL1Q4`, account `slushy@outlook.com`, unzoo profile
`Profile_msstore`. Store page: `apps.microsoft.com/detail/9nxghk2ll1q4`.

```bash
S=.claude/skills/store-submit
export UNZOO_TAB=$($S/unzoo.sh find-tab partner.microsoft.com)
```

## Packaging: no Windows machine required

Earlier notes claimed MSIX needs `makeappx` on Windows. It does not.

- `msiextract` (brew `msitools`) unpacks our MSI into five payload files:
  `SoloMD.exe`, `solomd-mcp.exe`, `file_icon.ico`, `en_US.aff`, `en_US.dic`.
- An MSIX is an OPC zip and **the Store re-signs it**, so no signtool and no
  certificate. Pure-Python `zipfile` with everything `ZIP_STORED`:
  `AppxManifest.xml` + `[Content_Types].xml` + `AppxBlockMap.xml`
  (base64 sha256 of each 64 KB block; STORED means no compressed size needed;
  `LfhSize = 30 + len(utf8 name)`).
- Zip order matters: payload → manifest → `[Content_Types]` → blockmap.
- Icons come from `app/src-tauri/icons/Square{44,71,150,310}Logo.png` and
  `StoreLogo.png`.

**★ `pack_msix.py` has gone missing once**, because it lived in a temp
directory that got cleaned. If it is not on disk, rebuild it from the above
rather than hunting — and put it in `scripts/` this time.

Manifest traps:

- `Version` must end in `.0` — `4.11.9.0` is accepted, `4.11.9.1` fails with
  "revision number other than zero".
- Listing `DefaultTile`/`Square310` with incomplete assets throws
  `APPX_E_INVALID_MANIFEST (0x80080204)`. Start with only `Square150` +
  `Square44`, validate, then add the `.md`/`.markdown`/`.txt`
  FileTypeAssociation extension.
- `BackgroundColor` `#121110` works; so does `transparent`.

Each release: bump the third segment of `Version`, keep the fourth at `0`.

## Submitting

1. Overview → **Start update**. The button is an `he-button` with a *closed*
   shadow root, so it cannot be clicked by selector — `shot`, read the
   coordinates, `click`. The URL will not change, but the submission has been
   created server-side: reload the overview and the draft plus its section
   links (`/submissions/<id>/packages`, `/options`, …) appear.
2. **Packages**: `unzoo.sh upload 'input[type=file]' SoloMD_X.Y.Z.msix`, then
   poll for "Validating…" to become a version number or an `APPX_E` error.
   - Same-version conflict ("uniquely identified") → delete one.
   - The previous version shows "will be removed". **Leave it alone.** Do not
     press its "Don't remove this package" — Save then clears it correctly.
   - The **Save button is in a closed-shadow footer**: scroll to the bottom,
     locate it in a screenshot, click by coordinate.
3. **★ "Submission options" stuck on Incomplete** is almost never a
   runFullTrust justification — this product's options page has no
   restricted-capability textarea at all. It is the publishing-hold option
   never having been explicitly saved. Open the options page, press the
   bottom Save once (closed shadow, ≈366,406), and the badge flips to
   Unchanged immediately.
4. Certification notes go on a separate page,
   `/suppinfo/additionaltestinginfo`; its button is "Save description" and is
   reachable by DOM.
5. When every section reads Complete/Unchanged/Validated, overview →
   **Submit for certification**, which becomes "Update in certification".

## ★ Trust the validate API, not the section badges

The per-section badges in Partner Center are flaky and have shown Incomplete
for sections that were fine, and fine for sections that blocked submission.
During registration this cost the most time of anything; the real blockers were
the IARC terms checkbox and a missing zh-CN listing (one listing is required
per language the package declares).

## Timing

Certification runs from a few hours to three working days, and the submission
is set to publish automatically once it passes. Verify afterwards on
`apps.microsoft.com/detail/9nxghk2ll1q4` — the version number there is the
only confirmation that counts.
