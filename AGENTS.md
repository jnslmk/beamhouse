## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Rig access (live hardware)

- The rig lives on `192.168.1.0/24`; this host joins it via Wi-Fi. A board
  plugged into the *user's* machine over USB is unreachable from here — say
  so immediately, never ask for serial output. (WLED serial JSON is
  state-only anyway; `POST /json/cfg` settings are HTTP-only.)
- "Node online" means all three: ping, `http://<ip>/json/info`, and its mDNS
  name. If the IP is silent, hunt before concluding: known-MAC grep in
  `ip neigh`, `nmap -sn 192.168.1.0/24`, then a `/json/info` fingerprint
  sweep of every up-host. STAR-TENT: MAC `68:FE:71:A5:2A:37`,
  `wled-a52a34.local`.
- Test everything short of live hardware without asking: repo unit tests,
  packet-format loopbacks, YAML schema loads through the owning parser.
  Never land half a hardware cutover — matched file + node halves ship in
  one sitting, integration gated on wire confirmation, not review pass.
- Known hazard: `192.168.1.243` was DHCP-reassigned to a Tasmota plug while
  the tent was away — verify the tent's real address on boot, conflict risk.
