$ErrorActionPreference = "Stop"

$excludedAdapterNames = '(?i)(loopback|vEthernet|Hyper-V|WSL|Docker|Virtual|VMware|VirtualBox|TAP|TUN|VPN|Bluetooth)'
$candidates = @(
  foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
    if ($adapter.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback) { continue }
    if ($adapter.Name -match $excludedAdapterNames) { continue }

    $priority = if ($adapter.Name -match '(?i)wi-?fi|wlan|wireless') { 0 }
      elseif ($adapter.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Ethernet) { 1 }
      else { 2 }

    foreach ($unicast in $adapter.GetIPProperties().UnicastAddresses) {
      $address = $unicast.Address
      if ($address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
      $octets = $address.GetAddressBytes()
      if ($octets[0] -eq 169 -and $octets[1] -eq 254) { continue }
      $isPrivate = $octets[0] -eq 10 -or
        ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
        ($octets[0] -eq 192 -and $octets[1] -eq 168)
      if (-not $isPrivate) { continue }

      [pscustomobject]@{
        Priority = $priority
        Adapter = $adapter.Name
        Address = $address.IPAddressToString
      }
    }
  }
) | Sort-Object Priority, Adapter, Address

if (-not $candidates.Count) {
  Write-Error "No active private Wi-Fi/Ethernet IPv4 address found. Connect to your classroom network and try again."
  exit 1
}

$selected = $candidates[0]
$env:STUDENT_ORIGIN = "http://$($selected.Address):4173"
Write-Host "Starting CkaDinTi for LAN at $($env:STUDENT_ORIGIN) (adapter: $($selected.Adapter))."
Write-Host "Open this address on the teacher computer and share it with students; QR links follow this address."

& docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "CkaDinTi is running. Teacher and student pages: $($env:STUDENT_ORIGIN)"
