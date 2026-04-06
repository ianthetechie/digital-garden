---
title: Setting up a WireGuard Tunnel on FreeBSD 15
date: 2026-04-07
tags:
- networking
- FreeBSD
---

It's not like the world needs yet another WireGuard tutorial,
but I thought I'd write one since one of the top SEO-ranked ones I stumbled upon was pretty low quality,
with several obvious errors and omissions.

In this post, I'll focus on how you can set up a VPN tunnel
in the sense that such things were used before shady companies hijacked the term.
It's just a way to tunnel traffic between networks.
For example, to connect non-internet-facing servers behind a firewall
to a public host that firewalls and selectively routes traffic over the tunnel.

I'll assume a pair of FreeBSD servers for the rest of the post,
one that's presumably more accessible (the "server"),
and a client which is not necessarily routable over the internet.

# "Server" setup

We'll start with the server setup.
This is where your client(s) will connect.
At a high level, we'll generate a keypair for the server,
a keypair for the client,
and generate configuration files for both.
And finally we'll do some basic firewall configuration.

## WireGuard config

The following can be run,
either in a script or line-by-line in a POSIX shell as root.

```sh
# Set this to your server's public IP
SERVER_PUBLIC_IP="192.0.2.42"

# We'll be setting up some config files here that we only want to be readable by root.
# The umask saves us the effort of having to chmod these later.
umask 077

# Wireguard kernel-level support is available in FreeBSD 14+,
# but this port has a nice service wrapper
pkg install wireguard-tools

# Set up WireGuard config directory
chmod 770 /usr/local/etc/wireguard
cd /usr/local/etc/wireguard

# Create a keypair for the server
SERVER_PRIV_KEY=$(wg genkey)
SERVER_PUB_KEY=`echo $SERVER_PRIV_KEY | wg pubkey`

# Generate the first section of our WireGuard server config.
# We'll use 172.16.0.1/24 (no real reason for the choice;
# it's just somewhat convenient as it doesn't collide with the more common
# Class A and Class C private networks).
cat > wg0.conf <<EOF
[Interface]
Address = 172.16.0.1/24
SaveConfig = true
ListenPort = 51820
PrivateKey = ${SERVER_PRIV_KEY}
EOF

# Similarly, we need a client keypair
CLIENT_PRIV_KEY=$(wg genkey)
CLIENT_PUB_KEY=`echo $CLIENT_PRIV_KEY | wg pubkey`

# Add peer to the server config.
# This is what lets your client connect later.
# The server only stores the client's public key
# and the private IP that it will connect as.
CLIENT_IP="172.16.0.2"
cat >> wg0.conf <<EOF
# bsdcube
[Peer]
PublicKey = ${CLIENT_PUB_KEY}
AllowedIps = ${CLIENT_IP}/32
EOF

umask 022 # Revert to normal umask

# Enable the wireguard service
sysrc wireguard_interfaces="wg0"
sysrc wireguard_enable="YES"
service wireguard start
```

**Don't ditch this shell session yet!**
We'll come back to the client config later and will need the vars defined above.
But first, a brief interlude for packet filtering.

## `pf` setup

We'll use `pf`, the robust packet filtering (colloquially "firewall") system
ported from OpenBSD.

I'm using `vtnet0` for the external interface,
since that's the interface name with my VPS vendor.
You may need to change this based on what your main network interface is
(check `ifconfig`).

**DISCLAIMER**: This is _not_ necessarily everything you need to launch a production system.
I've distilled just the parts that are relevant to a minimal WireGuard setup.
That said, here's a minimal `/etc/pf.conf`.

```pf
ext_if = "vtnet0"
wg_if = "wg0"

# Pass all traffic on the loopback interface
set skip on lo

# Basic packet cleanup
scrub in on $ext_if all fragment reassemble

# Allows WireGuard clients to reach the internet.
# I do not nede this in my config, but noting it here
# in case your use case is *that* sort of VPN.
# nat on $ext_if from $wg_if:network to any -> ($ext_if)

# Allow all outbound connections
pass out keep state

# SSH (there's a good chance you need this)
pass in on $ext_if proto tcp from any to ($ext_if) port 22

# Allow inbound WireGuard traffic
pass in on $ext_if proto udp from any to ($ext_if) port 51820

# TODO: Forwarding for the services that YOU need
# Here's one example demonstrating how you would allow traffic
# to route directly to one of the WireGuard network IPs (e.g. 172.16.42.1/24 in this example)
# over port 8080.
# pass in on $wg_if proto tcp from $wg_if:network to ($wg_if) port 8080

# Allow ICMP
pass in inet proto icmp all
pass in inet6 proto icmp6 all
```

Next, we enable the service and start it.
If you're already running `pf`, then at least part of this isn't necessary.

```sh
# Allow forwarding of traffic from from WireGuard clients
sysctl net.inet.ip.forwarding=1

# Enable pf
sysrc pf_enable="YES"
service pf start
```

# Client configuration

And now we come back to the client configuration.
The "client" in this case does not necessarily have to be routable over the internet;
it just needs to be able to connect to the server.
You've still got the same shell session with those variables, right?

```sh
cat <<EOF
[Interface]
PrivateKey = ${CLIENT_PRIV_KEY}
Address = ${CLIENT_IP}/24

[Peer]
PublicKey = ${SERVER_PUB_KEY}
AllowedIPs = 172.16.0.0/24  # Only route private subnet traffic over the tunnel
Endpoint = ${SERVER_PUBLIC_IP}:51820
PersistentKeepalive = 30
EOF
```

That's it; that's the client config.
Run through the same initial setup steps for adding the `wireguard-tools` package
and creating the directory with the right permissions.
Then put this config in `/usr/local/etc/wireguard/wg0.conf`.

The client will also need a similar `pf` configuration,
but rather than blanket allowing traffic in over `$wg_if`,
you probably want something a bit more granular.
For example, allowing traffic in over a specific port (e.g. `8080`).
I'll leave that as an exercise to the reader based on the specific scenario.
