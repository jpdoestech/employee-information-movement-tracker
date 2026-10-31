# Government ID formats

Store IDs as text. Preserve leading zeroes and remove spaces/hyphens on input.
Require the exact digit count in both shared controls and PostgreSQL validation.
Do not claim a length-valid value is a verified/issued government identifier.

| Entry | Stored digits | Official reference |
| --- | --- | --- |
| BIR TIN | 9, excluding branch code | [BIR RMO 20-2005](https://bir-cdn.bir.gov.ph/BIR/pdf/22145RMO%2020-2005.pdf) |
| SSS Number | 10 | [SSS My.SSS guide](https://www.sss.gov.ph/sss/DownloadContent?fileName=SSSForm_MySSS_Brochure.pdf) |
| PhilHealth PIN | 12 | [PhilHealth Circular 2019-0002](https://www.philhealth.gov.ph/circulars/2019/circ2019-0002.pdf) |
| Pag-IBIG MID | 12 | [Pag-IBIG Member Data Form V12](https://www.pagibigfund.gov.ph/document/pdf/dlforms/providentrelated/PFF039_MembersDataForm_V12.pdf) |

BIR branch codes are separate from the personal TIN and are not stored in this
field. Pag-IBIG's registration tracking number is not a MID.

The defaults are mandatory for new profiles, restricted to explicit field grants,
and excluded from eligible register columns by default. Adding IDs does not grant
any app role access automatically and does not approve their export to Sheets.
Configure authorized operators' Create/Read/Update actions before collecting IDs.
Never put actual employee identifiers into fixtures, logs, screenshots or commits.
Historical records retain missing IDs until an authorized operator supplies them;
an unrelated edit does not manufacture or silently require a historical identifier.

Migrations 20261012000100 through 20261012000300 provide profile defaults, ID
validation, authorized/idempotent initial position capture and default tab layout.
No hosted database is changed by local verification.
