param(
  [int]$Count = 150
)

# This seed script generates normal varied case data,
# but injects a consistent judge bias pattern so audit metrics become visible.
$Mode = "biased_gender"

# seed_demo.ps1
$ErrorActionPreference = "Stop"

$API = "http://127.0.0.1:8001"

# Use unique usernames each run
$suffix = (Get-Date -Format "yyyyMMddHHmmss")
$judgeUser = "judge.seed.$suffix"
$authUser  = "authority.seed.$suffix"
$pass      = "pass123"

Write-Host "Creating Court Authority user: $authUser"
$authSignupBody = @{
  full_name    = "Seed Authority"
  username     = $authUser
  password     = $pass
  authority_id = "Seed-Authority-01"
} | ConvertTo-Json

$authResp = Invoke-RestMethod -Method Post -Uri "$API/auth/court-authority/signup" -ContentType "application/json" -Body $authSignupBody
$authToken = $authResp.access_token

Write-Host "Creating Judge user: $judgeUser"
$judgeSignupBody = @{
  full_name = "Seed Judge"
  username  = $judgeUser
  password  = $pass
  bench_id  = "Seed-Bench-01"
} | ConvertTo-Json

$judgeResp = Invoke-RestMethod -Method Post -Uri "$API/auth/judge/signup" -ContentType "application/json" -Body $judgeSignupBody
$judgeToken = $judgeResp.access_token

# Feature pools (increase variety for both AI prediction and SHAP)
$regions = @("Maharashtra","Delhi","Karnataka","Tamil Nadu","Gujarat")
# User requested: no unknown bucket; only male/female
$genders = @("male","female")
$crimeTypes = @("Theft","Assault","Fraud","Robbery")
$ipcTypes = @("379","323","420","394")
$bailTypes = @("Personal Bond","Surety","Cash Bail","Custodial Bail")
$legalPrinciples = @(
  "bail under CrPC factors: flight risk and likelihood of repeating offence",
  "considerations include prior convictions and risk to public safety",
  "bail standard: balance of probability and conditions to ensure appearance",
  "review under due process with attention to witness safety"
)
$specialLaws = @("none","SC/ST protection statute","financial offence statutes","public safety directives")

function Get-Decision {
  param(
    [string]$gender,
    [string]$region,
    [int]$i
  )

  # Deterministic pattern so results are repeatable.
  # biased_gender:
  # - female: grant 80% of the time
  # - male: grant 40% of the time
  if ($gender -eq "female") {
    if (($i % 10) -lt 8) { return "Bail Granted" } else { return "Bail Rejected" }
  }
  if ($gender -eq "male") {
    if (($i % 10) -lt 4) { return "Bail Granted" } else { return "Bail Rejected" }
  }

  # Fallback (should not happen since we removed 'unknown' from the seed)
  return (if (($i % 10) -lt 5) { "Bail Granted" } else { "Bail Rejected" })
}

$caseIds = @()

for ($i=1; $i -le $Count; $i++) {
  $region = $regions[($i-1) % $regions.Count]
  $gender = $genders[($i-1) % $genders.Count]
  $crime_type = $crimeTypes[($i-1) % $crimeTypes.Count]
  $ipc_sections = $ipcTypes[($i-1) % $ipcTypes.Count]

  $bail_cancellation_case = [int]($i % 2)
  $landmark_case = [int](($i+1) % 2)
  $bias_flag = [int]($i % 5 -eq 0)
  $parity_argument_used = [int]($i % 3 -eq 0)
  $prior_cases = [int](($i % 4))

  $bail_type = $bailTypes[($i-1) % $bailTypes.Count]
  $legal_principles_discussed = $legalPrinciples[($i-1) % $legalPrinciples.Count]
  $special_laws = $specialLaws[($i-1) % $specialLaws.Count]

  $bail_outcome_label_detailed = [int](($i % 2))

  $payload = @{
    date = "2026-03-01"
    accused_gender = $gender
    region = $region
    court = "Demo Court $i"
    judge = "JudgeAI"
    facts = "Demo facts for case $i. Accused seeks bail. Low flight risk. Cooperating with investigation."
    legal_issues = "Bail under CrPC for $crime_type. IPC $ipc_sections."
    judgment_reason = "No prior convictions and stable residence. Witness safety considered."
    summary = "Seeded demo case $i for $region ($gender)."
    crime_type = $crime_type
    ipc_sections = $ipc_sections
    prior_cases = $prior_cases

    bail_cancellation_case = $bail_cancellation_case
    landmark_case = $landmark_case
    bias_flag = $bias_flag
    parity_argument_used = $parity_argument_used

    bail_type = $bail_type
    legal_principles_discussed = $legal_principles_discussed
    special_laws = $special_laws
    bail_outcome_label_detailed = $bail_outcome_label_detailed
  } | ConvertTo-Json

  $pred = Invoke-RestMethod -Method Post -Uri "$API/predict" -Headers @{ Authorization = "Bearer $authToken" } -ContentType "application/json" -Body $payload

  if (-not $pred.case_id) { throw "No case_id returned from /predict for case $i" }

  $caseIds += [int]$pred.case_id
  Write-Host "Created case_id=$($pred.case_id) AI=$($pred.decision)"
}

# Save judge decisions for each case (this is where we inject bias)
for ($idx=0; $idx -lt $caseIds.Count; $idx++) {
  $caseId = $caseIds[$idx]

  # Derive the same group attributes as the payload loop so we can create a controlled bias pattern.
  $i = $idx + 1
  $region = $regions[($i-1) % $regions.Count]
  $gender = $genders[($i-1) % $genders.Count]
  $decision = Get-Decision -gender $gender -region $region -i $i

  $notes = if ($decision -eq "Bail Granted") {
    "Granted with conditions: passport surrender + weekly reporting. (seeded note; Mode=$Mode; gender=$gender; region=$region)"
  } else {
    "Rejected due to witness intimidation risk / custodial interrogation need. (seeded note; Mode=$Mode; gender=$gender; region=$region)"
  }

  $decBody = @{
    case_id = $caseId
    decision = $decision
    notes = $notes
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$API/judge/decision" -Headers @{ Authorization = "Bearer $judgeToken" } -ContentType "application/json" -Body $decBody | Out-Null
  Write-Host "Saved judge decision for case_id=$caseId -> $decision"
}

Write-Host ""
Write-Host "Done."
Write-Host "Login creds:"
Write-Host "Court Authority: $authUser / $pass"
Write-Host "Judge:         $judgeUser / $pass"