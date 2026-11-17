#!/usr/bin/env python3
"""
Aetherhold — a 3D chat & roleplay game server.

Two ways to use this file:

  Host:     python server.py
            python server.py --host 0.0.0.0 --port 8080 --room "The Gilded Flagon"

  Connect:  python server.py --connect http://192.168.1.20:8080

Hosting serves the game, its room API, the written Codex and a control panel at
/admin. Connecting starts a tiny local launcher that serves the same game and
pre-fills the host address, so a guest can play against a remote host without
installing anything else.

Pure standard library: no pip install required.
"""

from __future__ import annotations

import argparse
import hmac
import importlib.util
import ipaddress
import json
import math
import mimetypes
import os
import random
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
import unicodedata
import uuid
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

APP_NAME = "Aetherhold"
VERSION = "1.2.0"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DEFAULT_BANS_FILE = os.path.join(BASE_DIR, "bans.json")

MAX_PLAYERS_LIMIT = 16
MESSAGE_HISTORY = 250
PLAYER_TIMEOUT = 15.0        # seconds without a sync before a player is dropped
ROOM_IDLE_TIMEOUT = 60 * 30  # empty room is reclaimed after this long
CHAT_COOLDOWN = 0.25
MAX_MESSAGE_LENGTH = 400
NAME_MAX = 22
FEAR_RADIUS = 9.0
FEAR_SECONDS = 25.0

CLASSES = {"Warrior", "Mage", "Rogue", "Scholar", "Bard", "Ranger"}
THEMES = {"ember": "Ember Camp", "moonlit": "Moonlit Grove", "frost": "Frostfall Ruins"}

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
DICE_RE = re.compile(r"^/(?:r|roll)\s+(\d{0,2})\s*d\s*(\d{1,3})\s*(?:([+-])\s*(\d{1,3}))?$", re.IGNORECASE)
SAFE_ID = re.compile(r"[^A-Za-z0-9_.:-]")

# --------------------------------------------------------------------------- #
# The written rules of the realm
# --------------------------------------------------------------------------- #
CODEX = {
    "version": VERSION,
    "title": "The Aetherhold Codex",
    "subtitle": "Written law of the hall — binding on every wanderer who enters",
    "world": {
        "name": "The Aetherhold",
        "summary": (
            "A waystation carved into the seam between worlds. The plaza sits on a dead "
            "road that once carried caravans between the Ember Marches and the Frostfall "
            "Reaches. The fire at its heart has burned without fuel for four hundred years, "
            "and the wards still hold — which is why exiles, oath-breakers, scholars and "
            "merchants who cannot go home all end up here."
        ),
        "sections": [
            {
                "title": "Physics of the place",
                "body": (
                    "Iron is cold here and stays cold. Flame gives light without heat unless "
                    "it is fed. The mist beyond the outer ring eats sound: shouting out there "
                    "carries about thirty paces, and no further. Nothing flies. Nothing that "
                    "dies inside the ring stays dead until the fire is banked — but the "
                    "returned come back quieter, and they remember less."
                ),
            },
            {
                "title": "Society",
                "body": (
                    "The hold is neutral ground, kept by the Wardens of the Ash, an order of "
                    "seven who will not fight and cannot be bribed. Guests are expected to "
                    "share what they carry and to answer a direct question honestly. Names "
                    "are given, not taken: a wanderer may refuse to give one, and that refusal "
                    "is respected. Blood feuds are left at the outer ring."
                ),
            },
            {
                "title": "Time & travel",
                "body": (
                    "The hold keeps no calendar. Locals count in fires — 'three fires ago' — "
                    "and travellers arrive from every season at once. The road outward leads "
                    "wherever you last truly meant to go, which is why nobody leaves in anger."
                ),
            },
            {
                "title": "What your character would know",
                "body": (
                    "Everyone inside the ring has been here long enough to know the fire is "
                    "not to be touched, that the Wardens' silence is an answer, and that the "
                    "mist is not a place to sleep. Nobody arrives as a stranger to the world: "
                    "you have a trade, a debt or a reason, and the hold already has a place "
                    "for you in its gossip."
                ),
            },
        ],
    },
    "conduct": [
        {
            "id": "1",
            "title": "One character, one body",
            "body": (
                "You speak and act as a person who lives in this world. Your character has a "
                "name, an age, a face, a trade, a weakness, a fear and something they want. "
                "They are not a tourist: they know the hold, its customs and their own history."
            ),
        },
        {
            "id": "2",
            "title": "The world has rules",
            "body": (
                "The hold's physics and society bind everyone. No flying, no teleporting, no "
                "inventing a kingdom that contradicts the Codex. If you need a fact about the "
                "world, ask in OOC before inventing it."
            ),
        },
        {
            "id": "3",
            "title": "Power balance — no godmoding",
            "body": (
                "You may describe your own intent, never another character's result. 'I drive "
                "my blade at his ribs' is legal. 'I kill him' is not: it denies the other "
                "player a reaction. The server refuses those lines and asks you to rephrase. "
                "Use /try to offer an outcome and let the dice speak."
            ),
        },
        {
            "id": "4",
            "title": "Fear RP",
            "body": (
                "A life in this world is worth something. When steel is drawn within reach, "
                "the room goes cold and everyone close must answer it — freeze, yield, flee or "
                "fight, but answer. Drawing a weapon announces a threat; ignoring it is "
                "powergaming. State your fear with /fear."
            ),
        },
        {
            "id": "5",
            "title": "No metagaming",
            "body": (
                "Your character only knows what they have seen, heard or been told in play. "
                "Reading a nameplate, a Discord message or another player's sheet does not "
                "grant your character that knowledge. The server intercepts obvious OOC leaks "
                "in IC speech; take it to /ooc instead."
            ),
        },
        {
            "id": "6",
            "title": "IC and OOC never mix",
            "body": (
                "IC is everything your character says and does. OOC is you, the player, at the "
                "table: rules questions, comfort checks, scheduling. OOC speech is tagged in "
                "the log and never enters the fiction. A duel between characters is not a "
                "quarrel between players."
            ),
        },
        {
            "id": "7",
            "title": "Losing is allowed",
            "body": (
                "Characters are wrong, tired, frightened and occasionally beaten. A character "
                "who cannot fail is not a character. Take the failed roll, keep the scar, and "
                "let the table see it."
            ),
        },
        {
            "id": "8",
            "title": "The wardens' law",
            "body": (
                "Profanity, slurs and harassment are removed automatically and permanently — "
                "the server records the client and the name. The host can also kick or ban by "
                "hand from the console or from /admin. Bans apply to the person, not the "
                "character: you may return with a new story, but not with the same mouth."
            ),
        },
    ],
    "terms": [
        {"term": "IC", "body": "In character. Everything your character says, knows and does."},
        {"term": "OOC", "body": "Out of character. You at the table. Prefix with /ooc."},
        {"term": "Godmoding", "body": "Deciding another character's actions, thoughts or wounds for them."},
        {"term": "Powergaming", "body": "Refusing to lose, refusing fear, refusing to give the other side a turn."},
        {"term": "Metagaming", "body": "Using OOC knowledge inside the fiction."},
        {"term": "Fear RP", "body": "The obligation to react like a person who wants to live."},
        {"term": "Downtime", "body": "What happens between fires. Written in /me, not rolled."},
    ],
    "commands": [
        {"cmd": "/ooc <text>", "body": "Speak as yourself, out of character."},
        {"cmd": "/me <action>", "body": "Narrate what your character does."},
        {"cmd": "/try <action>", "body": "Attempt something uncertain — rolls d20 + your best stat."},
        {"cmd": "/roll 2d6+1", "body": "Throw dice. Resolved by the server, so everyone sees the same numbers."},
        {"cmd": "/draw [blade|bow|staff]", "body": "Draw a weapon. Everyone close must answer with /fear."},
        {"cmd": "/sheathe", "body": "Put the weapon away and let the room breathe."},
        {"cmd": "/fear <reaction>", "body": "Answer a drawn weapon in character."},
        {"cmd": "/look <name>", "body": "Study someone's public character sheet."},
        {"cmd": "/who", "body": "Who is present, and what they carry."},
        {"cmd": "/rules", "body": "A short reminder of the Codex."},
        {"cmd": "/help", "body": "All commands."},
    ],
    "sheet": {
        "fields": [
            ["name", "Name", "What the hold calls you."],
            ["age", "Age", "Years lived, not years survived."],
            ["pronouns", "Pronouns", "How others should address you."],
            ["occupation", "Trade", "What you do when the fire is low."],
            ["origin", "Origin", "Where you came from — and whether you can go back."],
            ["appearance", "Appearance", "Face, build, scars, what you wear."],
            ["weakness", "Weakness", "The thing that makes you lose."],
            ["fear", "Fear", "What your body does before your mind decides."],
            ["dream", "Dream", "What you would trade the road for."],
            ["backstory", "History", "How you came to the hold, and what you owe."],
        ],
    },
}

SHORT_RULES = (
    "Codex in brief — IC stays IC · no godmoding (describe intent, not results) · "
    "answer drawn steel with /fear · no metagaming · characters may lose. "
    "Full text: menu → Codex, or GET /api/codex."
)

# --------------------------------------------------------------------------- #
# Regions, languages and the road network
# --------------------------------------------------------------------------- #
LANGUAGES = {
    "en": {"name": "English", "native": "English"},
    "tr": {"name": "Turkish", "native": "Türkçe"},
}

TEXT = {
    "en": {
        "banner": "set up your server",
        "language": "Language",
        "region": "Region",
        "name": "Server name",
        "slots": "Player slots",
        "modules": "Modules",
        "database": "Database",
        "dashboard": "Control panel summary",
        "confirm": "Do you want to start? (Y/N)",
        "cancelled": "Start cancelled. Nothing was opened.",
        "starting": "Starting sockets, database and world data…",
        "default_hint": "press Enter for the default",
        "choose": "Choose",
        "invalid": "Not a valid choice",
        "slots_hint": "2–16 players",
        "db_hint": "SQLite file for fleet, cargo and discoveries",
        "language_set": "Language set to English.",
    },
    "tr": {
        "banner": "sunucu kurulumu",
        "language": "Dil",
        "region": "Bölge",
        "name": "Sunucu adı",
        "slots": "Oyuncu kapasitesi",
        "modules": "Modüller",
        "database": "Veritabanı",
        "dashboard": "Kontrol paneli özeti",
        "confirm": "Başlatmak istiyor musunuz? (E/H)",
        "cancelled": "Başlatma iptal edildi. Hiçbir şey açılmadı.",
        "starting": "Bağlantı noktaları, veritabanı ve dünya verisi hazırlanıyor…",
        "default_hint": "varsayılan için Enter'a basın",
        "choose": "Seçin",
        "invalid": "Geçersiz seçim",
        "slots_hint": "2–16 oyuncu",
        "db_hint": "Araç, kargo ve keşifler için SQLite dosyası",
        "language_set": "Dil Türkçe olarak ayarlandı.",
    },
}


def t(key: str, lang: str = "en") -> str:
    return TEXT.get(lang, TEXT["en"]).get(key) or TEXT["en"].get(key, key)


# Region catalogs. Coordinates are a stylised map plane in kilometres; the client
# draws this map and the 3D ring is a compressed local slice of the same world.
REGIONS = {
    "turkey": {
        "key": "turkey",
        "name": "Türkiye",
        "english": "Turkey",
        "defaultName": "Anadolu Lojistik Hattı",
        "timezone": "Europe/Istanbul",
        "utc": 3,
        "currency": "₺",
        "currencyCode": "TRY",
        "fuelPrice": 46.0,
        "cash": 28000,
        "language": "tr",
        "theme": "frost",
        "climate": "temperate",
        "blurb": ("Asfalt ana hatlar, dağ geçitleri ve bozkır yolları. İstanbul'dan Van'a "
                  "uzanan lojistik ağı; mazot, kargo ve sabır ister."),
        "start": "istanbul",
        "vehicles": ["truck", "van", "pickup"],
        "nodes": [
            ("istanbul", "İstanbul", "metropolis", -540, -300, "coastal", "garage,parts,fuel,inn,market,camp"),
            ("bursa", "Bursa", "town", -380, -230, "temperate", "fuel,inn,parts"),
            ("izmir", "İzmir", "metropolis", -330, -40, "coastal", "garage,parts,fuel,inn,market"),
            ("eskisehir", "Eskişehir", "town", -140, -230, "continental", "garage,fuel,camp"),
            ("ankara", "Ankara", "metropolis", 60, -260, "continental", "garage,parts,fuel,inn,market"),
            ("bolu", "Bolu Geçidi", "pass", -90, -430, "alpine", "camp,fuel"),
            ("samsun", "Samsun", "town", 300, -330, "coastal", "fuel,inn,parts"),
            ("trabzon", "Trabzon", "town", 530, -240, "coastal", "inn,fuel,camp"),
            ("erzurum", "Erzurum", "town", 520, -30, "alpine", "fuel,garage,inn"),
            ("van", "Van Geçidi", "pass", 630, 150, "alpine", "camp,fuel"),
            ("konya", "Konya", "town", -40, -60, "continental", "fuel,inn,parts"),
            ("kayseri", "Kayseri", "town", 250, -100, "continental", "scrapyard,fuel,garage"),
            ("adana", "Adana", "metropolis", 300, 150, "temperate", "garage,parts,fuel,market"),
            ("mersin", "Mersin", "town", 210, 260, "coastal", "fuel,inn"),
            ("antalya", "Antalya", "metropolis", -90, 220, "coastal", "garage,parts,fuel,inn,market"),
            ("pamukkale", "Pamukkale", "viewpoint", -200, 140, "temperate", "camp,viewpoint"),
            ("kapadokya", "Kapadokya", "historic", 150, 60, "desert", "camp,historic,inn"),
            ("mardin", "Mardin", "historic", 640, 330, "desert", "historic,inn,fuel"),
            ("bodrum", "Bodrum Kıyısı", "camp", -280, 170, "coastal", "camp,viewpoint,inn"),
            ("amasya", "Amasya", "town", 300, -170, "continental", "camp,fuel,inn"),
        ],
        "roads": [
            ("istanbul", "bursa", "highway", "O-5 Marmara Hattı", "bridge"),
            ("bursa", "eskisehir", "highway", "O-22 Bursa–Eskişehir", ""),
            ("eskisehir", "ankara", "highway", "O-20 Bozkır Hattı", ""),
            ("ankara", "konya", "highway", "O-21 Konya Ovası", ""),
            ("konya", "adana", "highway", "O-51 Toros Geçidi", "tunnel"),
            ("adana", "mersin", "highway", "D-400 Akdeniz Kıyısı", ""),
            ("mersin", "antalya", "secondary", "D-400 Kıyı Yolu", ""),
            ("antalya", "izmir", "highway", "D-350 Ege Hattı", ""),
            ("izmir", "bursa", "highway", "O-5 Kuzey Ege", ""),
            ("izmir", "bodrum", "secondary", "D-515 Bodrum Sapak", ""),
            ("izmir", "pamukkale", "secondary", "D-585 İç Ege", ""),
            ("pamukkale", "antalya", "secondary", "D-585 Güney Ege", ""),
            ("ankara", "samsun", "highway", "O-4 Karadeniz Hattı", "tunnel"),
            ("samsun", "amasya", "secondary", "D-100 Yeşilırmak", ""),
            ("amasya", "trabzon", "secondary", "D-885 Doğu Karadeniz", ""),
            ("samsun", "trabzon", "highway", "O-4 Sahil Hattı", ""),
            ("trabzon", "erzurum", "highway", "D-950 Zigana Geçidi", "tunnel"),
            ("erzurum", "van", "highway", "D-300 Doğu Anadolu", ""),
            ("van", "mardin", "highway", "D-300 Güneydoğu", ""),
            ("mardin", "adana", "secondary", "D-400 Güneydoğu Hattı", ""),
            ("adana", "kayseri", "secondary", "D-805 İç Anadolu", ""),
            ("kayseri", "konya", "secondary", "D-330 Bozkır Yolu", ""),
            ("kayseri", "samsun", "secondary", "D-795 Orta Karadeniz", ""),
            ("ankara", "kapadokya", "secondary", "D-750 Kapadokya", ""),
            ("kapadokya", "konya", "secondary", "D-300 Peri Bacaları", ""),
            ("bolu", "istanbul", "highway", "O-4 Bolu Dağı", "tunnel"),
            ("bolu", "ankara", "highway", "O-4 Ankara Hattı", ""),
            ("eskisehir", "konya", "secondary", "D-260 Bozkır Kesimi", ""),
            ("kapadokya", "mardin", "trail", "Eski Kervan Yolu", ""),
            ("konya", "mersin", "trail", "Toros Keçi Yolu", ""),
        ],
    },
    "america": {
        "key": "america",
        "name": "United States",
        "english": "United States",
        "defaultName": "Transcontinental Freight Line",
        "timezone": "America/Denver",
        "utc": -7,
        "currency": "$",
        "currencyCode": "USD",
        "fuelPrice": 1.05,
        "cash": 1600,
        "language": "en",
        "theme": "ember",
        "climate": "continental",
        "blurb": ("Interstates, desert passes and mountain snow. Coast-to-coast hauling "
                  "where fuel, weight and weather decide the route."),
        "start": "chicago",
        "vehicles": ["truck", "van", "pickup"],
        "nodes": [
            ("newyork", "New York", "metropolis", 760, -250, "coastal", "garage,parts,fuel,inn,market"),
            ("boston", "Boston", "town", 820, -330, "coastal", "fuel,inn,parts"),
            ("detroit", "Detroit", "metropolis", 440, -300, "continental", "garage,parts,scrapyard,market"),
            ("chicago", "Chicago", "metropolis", 300, -260, "continental", "garage,parts,fuel,inn,market"),
            ("stlouis", "St. Louis", "town", 200, -120, "continental", "fuel,inn,parts"),
            ("dallas", "Dallas", "metropolis", 30, 190, "desert", "garage,parts,fuel,market"),
            ("houston", "Houston", "town", 90, 320, "desert", "fuel,inn,parts"),
            ("miami", "Miami", "metropolis", 620, 380, "coastal", "garage,parts,fuel,inn,market"),
            ("atlanta", "Atlanta", "town", 540, 170, "temperate", "fuel,inn,camp"),
            ("denver", "Denver", "metropolis", -180, -140, "alpine", "garage,parts,fuel,inn,market"),
            ("saltlake", "Salt Lake", "town", -420, -170, "alpine", "fuel,inn,parts"),
            ("seattle", "Seattle", "metropolis", -620, -430, "coastal", "garage,parts,fuel,inn,market"),
            ("sanfrancisco", "San Francisco", "metropolis", -820, 60, "coastal", "garage,parts,fuel,inn,market"),
            ("losangeles", "Los Angeles", "metropolis", -700, 250, "coastal", "garage,parts,fuel,market"),
            ("phoenix", "Phoenix", "town", -380, 320, "desert", "fuel,garage,inn"),
            ("vegas", "Las Vegas", "town", -520, 170, "desert", "fuel,inn,market"),
            ("grandcanyon", "Grand Canyon", "viewpoint", -330, 120, "desert", "camp,viewpoint"),
            ("saltflats", "Bonneville Salt Flats", "pass", -500, -260, "alpine", "camp,fuel"),
            ("route66", "Route 66 Rest Stop", "historic", -120, 60, "desert", "historic,camp,fuel"),
            ("yellowstone", "Yellowstone Camp", "camp", -380, -420, "alpine", "camp,viewpoint"),
        ],
        "roads": [
            ("newyork", "boston", "highway", "I-95 Northeast", "tunnel"),
            ("newyork", "detroit", "highway", "I-80 Keystone", ""),
            ("detroit", "chicago", "highway", "I-94 Lakeshore", ""),
            ("chicago", "stlouis", "highway", "I-55 Mississippi", "bridge"),
            ("stlouis", "dallas", "highway", "I-44 / I-35 Prairie", ""),
            ("dallas", "houston", "highway", "I-45 Gulf", ""),
            ("dallas", "atlanta", "highway", "I-20 Southern", ""),
            ("atlanta", "miami", "highway", "I-75 / I-95 Atlantic", ""),
            ("atlanta", "chicago", "secondary", "US-41 Dixie", ""),
            ("chicago", "denver", "highway", "I-80 Plains", ""),
            ("denver", "saltlake", "highway", "I-70 Rockies", "tunnel"),
            ("saltlake", "seattle", "highway", "I-84 / I-90 Northwest", ""),
            ("seattle", "sanfrancisco", "highway", "I-5 Pacific", ""),
            ("sanfrancisco", "losangeles", "highway", "I-5 Central Valley", ""),
            ("losangeles", "vegas", "highway", "I-15 Mojave", ""),
            ("vegas", "phoenix", "highway", "US-93 Desert", ""),
            ("phoenix", "dallas", "secondary", "US-380 Dust Line", ""),
            ("denver", "dallas", "secondary", "US-287 High Plains", ""),
            ("denver", "grandcanyon", "secondary", "US-160 Canyon Road", ""),
            ("phoenix", "grandcanyon", "secondary", "I-17 / US-180", ""),
            ("saltlake", "saltflats", "secondary", "I-80 Salt Flats", ""),
            ("saltlake", "yellowstone", "secondary", "US-89 Mountain", ""),
            ("stlouis", "route66", "secondary", "Historic Route 66", ""),
            ("route66", "phoenix", "trail", "Old 66 Dirt Section", ""),
            ("chicago", "route66", "secondary", "Route 66 Gateway", ""),
            ("seattle", "yellowstone", "trail", "Cascade Backroad", ""),
        ],
    },
}

for _key, _region in REGIONS.items():
    _region["nodeIds"] = {node[0] for node in _region["nodes"]}
    for _road in _region["roads"]:
        if _road[0] not in _region["nodeIds"] or _road[1] not in _region["nodeIds"]:
            raise ValueError(f"road {_road} in region {_key} names an unknown place")

VEHICLES = {
    "truck": {
        "name": "Anatolian 440 Hauler", "label_tr": "Anadolu 440 Çekici",
        "tank": 240.0, "consumption": 28.0, "capacity": 18000.0, "seats": 2,
        "topSpeed": 110, "price": 45000,
    },
    "van": {
        "name": "Coastal 90 Van", "label_tr": "Kıyı 90 Panelvan",
        "tank": 90.0, "consumption": 11.0, "capacity": 3200.0, "seats": 3,
        "topSpeed": 130, "price": 18000,
    },
    "pickup": {
        "name": "Frontier 4x4", "label_tr": "Sınır 4x4 Pickup",
        "tank": 120.0, "consumption": 15.0, "capacity": 1100.0, "seats": 5,
        "topSpeed": 145, "price": 24000,
    },
}

PARTS = {
    "tire": {"en": "Spare tyre", "tr": "Yedek lastik", "kg": 22, "price": 240},
    "battery": {"en": "Battery", "tr": "Akü", "kg": 26, "price": 310},
    "body": {"en": "Body panel", "tr": "Kaporta", "kg": 48, "price": 420},
    "toolkit": {"en": "Toolkit", "tr": "Takım çantası", "kg": 14, "price": 180},
    "jerrycan": {"en": "Jerrycan (20 L)", "tr": "Bidon (20 L)", "kg": 24, "price": 150},
    "crate": {"en": "Cargo crate", "tr": "Kargo sandığı", "kg": 320, "price": 90},
}

CLIMATE = {
    "coastal":     {"en": "Coastal", "tr": "Kıyı", "fuel": 1.00, "grip": 1.00, "power": 1.00},
    "temperate":   {"en": "Temperate", "tr": "Ilıman", "fuel": 1.02, "grip": 0.98, "power": 0.99},
    "continental": {"en": "Continental", "tr": "Karasal", "fuel": 1.05, "grip": 0.94, "power": 0.96},
    "alpine":      {"en": "Alpine", "tr": "Dağlık", "fuel": 1.16, "grip": 0.82, "power": 0.88},
    "desert":      {"en": "Desert", "tr": "Çöl", "fuel": 1.09, "grip": 0.90, "power": 0.93},
}

# --------------------------------------------------------------------------- #
# Moderation word and pattern lists
# --------------------------------------------------------------------------- #
PROFANITY = frozenset({
    "fuck", "fucks", "fucked", "fucking", "fucker", "motherfucker", "shit", "shits",
    "shitty", "bullshit", "bitch", "bitches", "bastard", "asshole", "assholes",
    "dickhead", "cunt", "cunts", "slut", "sluts", "whore", "whores", "prick",
    "twat", "wanker", "bollocks", "cock", "pussy", "douchebag", "retard", "retarded",
    "nigger", "niggers", "faggot", "faggots", "tranny", "kike", "spic", "chink",
    "amk", "amq", "orospu", "orospucocugu", "siktir", "sikeyim", "sikik",
    "pezevenk", "amcik", "yarrak", "yavsak", "serefsiz", "gerizekali", "surtuk",
})

LEET = str.maketrans({
    "@": "a", "4": "a", "0": "o", "1": "i", "3": "e", "5": "s", "7": "t",
    "$": "s", "!": "i", "|": "i", "€": "e", "8": "b",
})

META_MARKERS = (
    "ooc", "out of character", "irl", "in real life", "real life", "my player",
    "my character sheet", "meta", "metagaming", "discord", "discord call",
    "the server", "server admin", "the admin", "as a player",
)

VIOLENCE = (
    "stab|stabs|stabbed|kill|kills|killed|slit|slits|slit|shoot|shoots|shot|strangle|strangles|"
    "behead|beheads|decapitate|decapitates|gut|guts|murder|murders|punch|punches|smack|"
    "smacks|kick|kicks|tackle|tackles|shove|shoves|burn|burns|poison|poisons|curse|curses|"
    "force|forces|choke|chokes|drown|drowns|break|breaks"
)
TARGET = r"you|your|yours|him|his|her|hers|them|their|theirs"

GODMODE_PATTERNS = (
    re.compile(r"\b(i|he|she|they|it|we)\b[^.?!;]{0,26}\b(" + VIOLENCE + r")\b[^.?!;]{0,42}\b(" + TARGET + r")\b", re.I),
    re.compile(r"\b(" + VIOLENCE + r")\b[^.?!;]{0,26}\b(" + TARGET + r")\b", re.I),
    re.compile(r"\b(" + TARGET + r")\b[^.?!;]{0,20}\b(die|dies|died|is dead|are dead|drop dead|"
               r"bleed out|bleeds out|fall dead|falls dead|are mine|is mine|are paralysed|"
               r"are paralyzed|are unconscious|is unconscious|are disarmed|is disarmed)\b", re.I),
)

# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class Player:
    __slots__ = ("id", "token", "client_id", "name", "cls", "color", "accent", "stats",
                 "sheet", "pos", "rot", "pitch", "look", "anim", "weapon", "fear_due", "fear_by",
                 "last_seen", "last_chat", "joined", "ip", "strikes", "recent")

    def __init__(self, name: str, cls: str, color: str, accent: str, stats: dict,
                 sheet: dict, client_id: str, ip: str):
        self.id = uuid.uuid4().hex[:10]
        self.token = uuid.uuid4().hex
        self.client_id = client_id
        self.name = name
        self.cls = cls
        self.color = color
        self.accent = accent
        self.stats = stats
        self.sheet = sheet
        self.pos = [0.0, 0.0, 0.0]
        self.rot = 0.0
        self.pitch = 0.0
        self.look = 0.0
        self.anim = "idle"
        self.weapon = ""
        self.fear_due = 0.0
        self.fear_by = ""
        self.last_seen = time.time()
        self.last_chat = 0.0
        self.joined = time.time()
        self.ip = ip
        self.strikes = 0
        self.recent = deque(maxlen=8)

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "cls": self.cls,
            "color": self.color,
            "accent": self.accent,
            "stats": self.stats,
            "sheet": self.sheet,
            "pos": [round(v, 3) for v in self.pos],
            "rot": round(self.rot, 3),
            "pitch": round(self.pitch, 3),
            "look": round(self.look, 3),
            "anim": self.anim,
            "weapon": self.weapon,
        }

    def fear_state(self) -> dict:
        left = max(0.0, self.fear_due - time.time())
        return {"active": left > 0, "secondsLeft": round(left, 1), "by": self.fear_by}


class Room:
    def __init__(self, name: str, max_players: int, password: str, theme: str):
        self.code = self._make_code()
        self.name = name
        self.max_players = max_players
        self.password = password
        self.theme = theme if theme in THEMES else "ember"
        self.players: dict[str, Player] = {}
        self.messages: deque[dict] = deque(maxlen=MESSAGE_HISTORY)
        self.seq = 0
        self.lock = threading.RLock()
        self.created = time.time()
        self.last_active = time.time()

    @staticmethod
    def _make_code() -> str:
        with ROOMS_LOCK:
            while True:
                code = "".join(random.choice(CODE_ALPHABET) for _ in range(4))
                if code not in ROOMS:
                    return code

    def info(self) -> dict:
        with self.lock:
            return {
                "code": self.code,
                "name": self.name,
                "players": len(self.players),
                "maxPlayers": self.max_players,
                "theme": self.theme,
                "locked": bool(self.password),
                "created": int(self.created),
            }

    def snapshot(self, viewer: str | None = None) -> dict:
        with self.lock:
            me = self.players.get(viewer) if viewer else None
            return {
                "code": self.code,
                "name": self.name,
                "maxPlayers": self.max_players,
                "theme": self.theme,
                "region": SERVER_CONFIG["region"],
                "language": SERVER_CONFIG["language"],
                "locked": bool(self.password),
                "seq": self.seq,
                "players": [p.public() for p in self.players.values()],
                "messages": [m for m in list(self.messages)[-80:] if _visible_to(m, viewer)],
                "selfId": viewer,
                "fear": me.fear_state() if me else {"active": False, "secondsLeft": 0, "by": ""},
            }

    def broadcast(self, message: dict) -> dict:
        with self.lock:
            self.seq += 1
            message["seq"] = self.seq
            message["ts"] = round(time.time() * 1000)
            self.messages.append(message)
            self.last_active = time.time()
            return message

    def add_player(self, player: Player) -> None:
        with self.lock:
            self.players[player.id] = player
            self.broadcast({
                "kind": "system",
                "text": f"{player.name} the {player.cls} steps out of the mist.",
                "from": None,
            })
            self.last_active = time.time()

    def remove_player(self, player_id: str, reason: str = "left") -> Player | None:
        with self.lock:
            player = self.players.pop(player_id, None)
            if not player:
                return None
            text = {
                "left": f"{player.name} vanishes into the mist.",
                "timeout": f"{player.name} was claimed by the silence.",
                "kick": f"{player.name} was asked to leave the hall.",
                "ban": f"{player.name} was removed by the wardens.",
            }.get(reason, f"{player.name} is gone.")
            self.broadcast({"kind": "system", "text": text, "from": None})
            self.last_active = time.time()
            return player

    def reap(self) -> None:
        now = time.time()
        with self.lock:
            for pid, player in list(self.players.items()):
                if now - player.last_seen > PLAYER_TIMEOUT:
                    self.remove_player(pid, reason="timeout")

    def find_by_token(self, token: str) -> Player | None:
        with self.lock:
            for player in self.players.values():
                if player.token == token:
                    return player
        return None

    def others_near(self, player: Player, radius: float) -> list[Player]:
        with self.lock:
            out = []
            for other in self.players.values():
                if other.id == player.id:
                    continue
                dx = other.pos[0] - player.pos[0]
                dz = other.pos[2] - player.pos[2]
                if dx * dx + dz * dz <= radius * radius:
                    out.append(other)
            return out


ROOMS: dict[str, Room] = {}
ROOMS_LOCK = threading.RLock()

BANS: list[dict] = []
BANS_LOCK = threading.RLock()
BANS_FILE = DEFAULT_BANS_FILE
FILTER_MODE = "ban"          # ban | log | off
ADMIN_KEY = ""
EVENTS: deque[dict] = deque(maxlen=200)
EVENTS_LOCK = threading.Lock()
STARTED = time.time()
STATS = {"joins": 0, "messages": 0, "banned": 0}

# Setup wizard / host configuration (filled by run_host).
SERVER_CONFIG = {
    "language": "en",
    "region": "turkey",
    "name": "",
    "slots": 8,
    "modules": ["vehicles", "logistics", "world"],
    "db": os.path.join(BASE_DIR, "aetherhold.db"),
}

DB_PATH = os.path.join(BASE_DIR, "aetherhold.db")
DB: sqlite3.Connection | None = None
DB_LOCK = threading.RLock()
WORLD: dict[str, dict] = {}
FLEET: dict[str, dict] = {}
ADMIN_PASSWORD = ""
ADMIN_SESSIONS: dict[str, float] = {}
LOGIN_FAILS: dict[str, list[float]] = {}


# --------------------------------------------------------------------------- #
# Mods / extensions
# --------------------------------------------------------------------------- #
# Any *.py file in ./mods is loaded at boot. A mod exposes an optional MOD dict
# (name, version, author, description) and a register(api) function. Through the
# api it can add chat commands, listen to events and push title / boss-bar
# announcements to the room. See mods/README.md for the contract.
MODS_DIR = os.path.join(BASE_DIR, "mods")
MODS: dict[str, "Mod"] = {}
MOD_COMMANDS: dict[str, dict] = {}
MOD_HOOKS: dict[str, list[dict]] = {"chat": [], "join": [], "leave": [], "tick": []}
MOD_ERRORS: list[str] = []


class ModContext:
    """What a mod handler receives: the room, the player and message helpers."""

    def __init__(self, mod: "Mod", room=None, player=None, text: str = "",
                 args=None, event: str = "", rooms=None):
        self.mod = mod
        self.room = room
        self.player = player
        self.text = text
        self.args = list(args or [])
        self.event = event
        self.rooms = rooms if rooms is not None else ROOMS
        self.data = mod.data

    def broadcast(self, text: str, kind: str = "system", detail: str = ""):
        if not self.room:
            return None
        return self.room.broadcast({
            "kind": kind, "from": None, "text": text,
            "detail": detail, "mod": self.mod.name,
        })

    def reply(self, text: str, kind: str = "system", detail: str = ""):
        if not self.room or not self.player:
            return None
        return self.room.broadcast({
            "kind": kind, "from": None, "text": text,
            "detail": detail, "to": self.player.id, "mod": self.mod.name,
        })

    def title(self, title: str, sub: str = ""):
        """Big centre-screen title + subtitle for everyone in the room."""
        return self.broadcast(title, kind="title", detail=sub)

    def bar(self, text: str, fraction: float = 0.5):
        """Boss-bar strip across the top of the screen."""
        value = max(0.0, min(1.0, float(fraction)))
        return self.broadcast(text, kind="bar", detail=f"{value:.3f}")


class Mod:
    def __init__(self, name: str, path: str):
        self.name = name
        self.path = path
        self.meta = {"name": name, "version": "1.0", "author": "", "description": ""}
        self.data: dict = {}
        self.loaded = False
        self.api = ModAPI(self)
        self.commands: list[str] = []
        self.events: list[str] = []

    def info(self) -> dict:
        return {
            "id": self.name,
            "name": self.meta.get("name", self.name),
            "version": str(self.meta.get("version", "1.0")),
            "author": str(self.meta.get("author", "")),
            "description": str(self.meta.get("description", "")),
            "commands": sorted(self.commands),
            "events": sorted(self.events),
            "loaded": self.loaded,
        }


class ModAPI:
    """The narrow surface a mod is allowed to touch."""

    def __init__(self, mod: Mod):
        self._mod = mod

    @property
    def name(self) -> str:
        return self._mod.name

    @property
    def data(self) -> dict:
        return self._mod.data

    def command(self, name: str, help_text: str = "", aliases=()):
        def decorator(fn):
            register_mod_command(self._mod, name, fn, help_text, aliases)
            return fn
        return decorator

    def on(self, event: str):
        if event not in MOD_HOOKS:
            raise ValueError(f"unknown event {event!r}; use one of {sorted(MOD_HOOKS)}")

        def decorator(fn):
            MOD_HOOKS[event].append({"mod": self._mod, "fn": fn})
            if event not in self._mod.events:
                self._mod.events.append(event)
            return fn
        return decorator

    def log(self, message) -> None:
        print(f"  [mod:{self._mod.name}] {message}")


def register_mod_command(mod: Mod, name: str, fn, help_text: str = "", aliases=()) -> None:
    clean = str(name).strip().lstrip("/").lower()
    if not clean:
        raise ValueError("a mod command needs a name")
    for key in [clean, *(str(a).lstrip("/").lower() for a in aliases)]:
        if key in MOD_COMMANDS:
            raise ValueError(f"command /{key} is already taken by {MOD_COMMANDS[key]['mod'].name}")
        MOD_COMMANDS[key] = {"mod": mod, "fn": fn, "help": help_text}
    if clean not in mod.commands:
        mod.commands.append(clean)


def load_mods(directory: str = MODS_DIR) -> list:
    """Import every mods/*.py and let it register itself."""
    MODS.clear()
    MOD_COMMANDS.clear()
    for event in MOD_HOOKS:
        MOD_HOOKS[event].clear()
    if not os.path.isdir(directory):
        return []
    for entry in sorted(os.listdir(directory)):
        if not entry.endswith(".py") or entry.startswith("_"):
            continue
        mod_id = entry[:-3]
        path = os.path.join(directory, entry)
        mod = Mod(mod_id, path)
        try:
            spec = importlib.util.spec_from_file_location(f"aetherhold_mod_{mod_id}", path)
            if spec is None or spec.loader is None:
                raise RuntimeError("could not be imported")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        except Exception as exc:  # noqa: BLE001 - a broken mod must not kill the server
            MOD_ERRORS.append(f"{entry}: {exc}")
            print(f"  ! mod {entry} failed to load: {exc}")
            continue
        meta = getattr(module, "MOD", None)
        if isinstance(meta, dict):
            for key in ("name", "version", "author", "description"):
                if key in meta:
                    mod.meta[key] = meta[key]
        register = getattr(module, "register", None)
        if callable(register):
            try:
                register(mod.api)
            except Exception as exc:  # noqa: BLE001
                MOD_ERRORS.append(f"{entry} register(): {exc}")
                print(f"  ! mod {entry} register() failed: {exc}")
                continue
        mod.loaded = True
        MODS[mod_id] = mod
        print(f"  + mod {mod.meta['name']} v{mod.meta['version']}"
              + (f" — /{', /'.join(mod.commands)}" if mod.commands else ""))
    return list(MODS.values())


def mods_emit(event: str, **kwargs) -> None:
    """Run every hook for an event. A failing hook is logged, never fatal."""
    for hook in list(MOD_HOOKS.get(event, ())):
        try:
            hook["fn"](ModContext(hook["mod"], event=event, **kwargs))
        except Exception as exc:  # noqa: BLE001
            MOD_ERRORS.append(f"{hook['mod'].name} {event}: {exc}")
            del MOD_ERRORS[:-24]


def mods_command(room, player, text: str):
    """Run a mod-provided /command. Returns None when no mod owns it."""
    if not text.startswith("/"):
        return None
    body = text[1:].strip()
    if not body:
        return None
    name, _, rest = body.partition(" ")
    entry = MOD_COMMANDS.get(name.lower())
    if not entry:
        return None
    mod = entry["mod"]
    ctx = ModContext(mod, room=room, player=player, text=rest.strip(),
                     args=rest.split(), event="command")
    try:
        result = entry["fn"](ctx)
    except Exception as exc:  # noqa: BLE001
        MOD_ERRORS.append(f"{mod.name} /{name}: {exc}")
        raise ApiError(500, f"The {mod.meta.get('name', mod.name)} mod failed") from exc
    if isinstance(result, str) and result:
        ctx.reply(result)
    return {"ok": True, "mod": mod.name, "command": name.lower()}


def start_mod_ticker(interval: float = 4.0) -> None:
    """Give mods a heartbeat so they can run events and countdowns."""
    if not MOD_HOOKS["tick"]:
        return

    def loop():
        while True:
            time.sleep(interval)
            mods_emit("tick")

    threading.Thread(target=loop, daemon=True, name="mod-ticker").start()


def build_world(region_key: str) -> dict:
    """Turn the region catalog into the road graph the client maps and drives."""
    region = REGIONS[region_key]
    coords = {node[0]: (node[3], node[4]) for node in region["nodes"]}
    climate = {node[0]: node[5] for node in region["nodes"]}
    severity = {"coastal": 0, "temperate": 1, "continental": 2, "desert": 3, "alpine": 4}

    nodes = []
    for (nid, name, kind, x, z, cli, services) in region["nodes"]:
        nodes.append({
            "id": nid, "name": name, "kind": kind, "x": x, "z": z, "climate": cli,
            "services": [s for s in services.split(",") if s],
        })

    roads = []
    for (a, b, kind, name, feature) in region["roads"]:
        ax, az = coords[a]
        bx, bz = coords[b]
        km = round(math.hypot(bx - ax, bz - az) * 1.35, 1)
        if km < 1:
            km = 1.0
        surface = {"highway": "asphalt", "secondary": "asphalt", "trail": "gravel"}.get(kind, "asphalt")
        road_climate = climate[a] if severity[climate[a]] >= severity[climate[b]] else climate[b]
        roads.append({
            "id": f"{a}-{b}", "from": a, "to": b, "kind": kind, "name": name,
            "km": km, "feature": feature, "surface": surface, "climate": road_climate,
        })

    return {
        "region": region["key"],
        "name": region["name"],
        "defaultName": region["defaultName"],
        "timezone": region["timezone"],
        "utc": region["utc"],
        "currency": region["currency"],
        "currencyCode": region["currencyCode"],
        "fuelPrice": region["fuelPrice"],
        "language": region["language"],
        "theme": region["theme"],
        "blurb": region["blurb"],
        "start": region["start"],
        "nodes": nodes,
        "roads": roads,
        "climate": CLIMATE,
        "scale": {"kmPerUnit": 1.35},
        "vehicles": [{"key": key, **spec} for key, spec in VEHICLES.items() if key in region["vehicles"]],
        "parts": {key: {"en": p["en"], "tr": p["tr"], "kg": p["kg"], "price": p["price"]}
                  for key, p in PARTS.items()},
    }


def load_world_data() -> None:
    WORLD.clear()
    for key in REGIONS:
        WORLD[key] = build_world(key)


def init_db(path: str) -> None:
    """Open (or create) the SQLite store and mirror it into memory."""
    global DB, DB_PATH
    DB_PATH = os.path.abspath(path)
    with DB_LOCK:
        if DB is not None:
            try:
                DB.close()
            except sqlite3.Error:
                pass
        DB = sqlite3.connect(DB_PATH, check_same_thread=False)
        DB.row_factory = sqlite3.Row
        DB.execute("PRAGMA journal_mode=WAL")
        DB.execute("""
            CREATE TABLE IF NOT EXISTS fleet (
                client_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated REAL NOT NULL
            )""")
        DB.execute("""
            CREATE TABLE IF NOT EXISTS discoveries (
                client_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                at REAL NOT NULL,
                PRIMARY KEY (client_id, node_id)
            )""")
        DB.execute("""
            CREATE TABLE IF NOT EXISTS world_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )""")
        DB.execute("INSERT OR REPLACE INTO world_meta (key, value) VALUES (?, ?)",
                   ("world_version", VERSION))
        DB.execute("INSERT OR REPLACE INTO world_meta (key, value) VALUES (?, ?)",
                   ("region", SERVER_CONFIG["region"]))
        DB.commit()
    load_fleet()


def load_fleet() -> None:
    FLEET.clear()
    if DB is None:
        return
    with DB_LOCK:
        rows = DB.execute("SELECT client_id, data FROM fleet").fetchall()
    for row in rows:
        try:
            data = json.loads(row["data"])
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(data, dict) and data.get("clientId"):
            FLEET[row["client_id"]] = data


def default_fleet(client_id: str, region_key: str | None = None) -> dict:
    region = REGIONS[region_key or SERVER_CONFIG["region"]]
    model = "truck" if "truck" in region["vehicles"] else region["vehicles"][0]
    spec = VEHICLES[model]
    return {
        "clientId": client_id,
        "region": region["key"],
        "vehicle": model,
        "node": region["start"],
        "pos": [0.0, 0.0, 0.0],
        "heading": 0.0,
        "fuel": spec["tank"],
        "condition": 100.0,
        "odometer": 0.0,
        "cargo": {},
        "cash": float(region["cash"]),
        "discovered": [region["start"]],
        "rescues": 0,
        "updated": time.time(),
    }


def get_fleet(client_id: str, region_key: str | None = None) -> dict:
    with DB_LOCK:
        fleet = FLEET.get(client_id)
    if fleet is None:
        fleet = default_fleet(client_id, region_key)
        # A driver knows the roads out of the stop they are standing in.
        for neighbour in _neighbours(fleet):
            _discover(fleet, neighbour)
        with DB_LOCK:
            FLEET[client_id] = fleet
        save_fleet(fleet)
    return fleet


def save_fleet(fleet: dict) -> None:
    fleet["updated"] = time.time()
    client_id = fleet["clientId"]
    with DB_LOCK:
        FLEET[client_id] = fleet
        if DB is not None:
            try:
                DB.execute(
                    "INSERT INTO fleet (client_id, data, updated) VALUES (?, ?, ?) "
                    "ON CONFLICT(client_id) DO UPDATE SET data = excluded.data, updated = excluded.updated",
                    (client_id, json.dumps(fleet), fleet["updated"]),
                )
                DB.executemany(
                    "INSERT OR IGNORE INTO discoveries (client_id, node_id, at) VALUES (?, ?, ?)",
                    [(client_id, node, fleet["updated"]) for node in fleet.get("discovered", [])],
                )
                DB.commit()
            except sqlite3.Error as exc:
                log_event("warn", "Database write failed", str(exc))


def fleet_cargo_kg(fleet: dict) -> float:
    total = 0.0
    for key, qty in fleet.get("cargo", {}).items():
        part = PARTS.get(key)
        if not part or not isinstance(qty, (int, float)):
            continue
        total += part["kg"] * max(0, int(qty))
    return round(total, 1)


def fleet_range_km(fleet: dict) -> float:
    spec = VEHICLES.get(fleet.get("vehicle"), VEHICLES["truck"])
    world = WORLD.get(fleet.get("region")) or WORLD[SERVER_CONFIG["region"]]
    node = next((n for n in world["nodes"] if n["id"] == fleet.get("node")), None)
    climate = (CLIMATE.get(node["climate"]) if node else CLIMATE["temperate"])
    load_ratio = min(1.5, fleet_cargo_kg(fleet) / max(1.0, spec["capacity"]))
    condition_penalty = 1 + max(0.0, 100 - fleet.get("condition", 100)) * 0.004
    per_100 = spec["consumption"] * (1 + 0.35 * load_ratio) * climate["fuel"] * condition_penalty
    return round(fleet.get("fuel", 0) / per_100 * 100, 1)


def fleet_public(fleet: dict) -> dict:
    region = REGIONS.get(fleet.get("region"), REGIONS[SERVER_CONFIG["region"]])
    spec = VEHICLES.get(fleet.get("vehicle"), VEHICLES["truck"])
    return {
        **fleet,
        "cargoKg": fleet_cargo_kg(fleet),
        "capacity": spec["capacity"],
        "tank": spec["tank"],
        "consumption": spec["consumption"],
        "rangeKm": fleet_range_km(fleet),
        "model": spec["name"],
        "modelTr": spec["label_tr"],
        "currency": region["currency"],
        "fuelPrice": region["fuelPrice"],
    }


def _find_node(fleet: dict) -> dict | None:
    world = WORLD.get(fleet.get("region")) or WORLD[SERVER_CONFIG["region"]]
    return next((n for n in world["nodes"] if n["id"] == fleet.get("node")), None)


def _find_road(fleet: dict, target: str) -> dict | None:
    world = WORLD.get(fleet.get("region")) or WORLD[SERVER_CONFIG["region"]]
    for road in world["roads"]:
        if {road["from"], road["to"]} == {fleet.get("node"), target}:
            return road
    return None


def _neighbours(fleet: dict) -> list[str]:
    world = WORLD.get(fleet.get("region")) or WORLD[SERVER_CONFIG["region"]]
    out = []
    for road in world["roads"]:
        if road["from"] == fleet["node"]:
            out.append(road["to"])
        elif road["to"] == fleet["node"]:
            out.append(road["from"])
    return out


def _discover(fleet: dict, node_id: str) -> bool:
    if node_id in fleet.setdefault("discovered", []):
        return False
    fleet["discovered"].append(node_id)
    return True


def fleet_travel(fleet: dict, target: str) -> dict:
    world = WORLD.get(fleet.get("region")) or WORLD[SERVER_CONFIG["region"]]
    if not any(node["id"] == target for node in world["nodes"]):
        raise ApiError(404, "That place is not on this map")
    road = _find_road(fleet, target)
    if road is None:
        undiscovered = target not in fleet.get("discovered", [])
        raise ApiError(403 if undiscovered else 409,
                       "Fog of war: no scouted road leads there" if undiscovered
                       else "No road runs from here to there")
    spec = VEHICLES.get(fleet.get("vehicle"), VEHICLES["truck"])
    climate = CLIMATE.get(road.get("climate"), CLIMATE["temperate"])
    load_ratio = min(1.5, fleet_cargo_kg(fleet) / max(1.0, spec["capacity"]))
    condition_penalty = 1 + max(0.0, 100 - fleet.get("condition", 100)) * 0.004
    need = round(road["km"] * spec["consumption"] / 100 * (1 + 0.35 * load_ratio)
                 * climate["fuel"] * condition_penalty, 2)
    if need > fleet.get("fuel", 0) + 0.001:
        raise ApiError(409, (
            f"Not enough fuel: the run to {target} needs {need:.1f} L and the tank holds "
            f"{fleet['fuel']:.1f} L. Refuel or call roadside assistance."))
    fleet["fuel"] = round(max(0.0, fleet["fuel"] - need), 2)
    fleet["odometer"] = round(fleet.get("odometer", 0.0) + road["km"], 2)
    fleet["condition"] = round(max(0.0, fleet.get("condition", 100) - road["km"] * 0.006), 2)
    fleet["node"] = target
    fleet["pos"] = [0.0, 0.0, 0.0]
    fleet["heading"] = 0.0
    discovered = [target]
    for neighbour in _neighbours(fleet):
        if _discover(fleet, neighbour):
            discovered.append(neighbour)
    save_fleet(fleet)
    return {"fleet": fleet_public(fleet), "road": road,
            "spent": need, "discovered": discovered}


def fleet_action(client_id: str, body: dict) -> dict:
    """Fuel, repairs, cargo, rescue and vehicle changes — validated on the server."""
    fleet = get_fleet(client_id)
    action = str(body.get("action") or "")
    node = _find_node(fleet) or {}
    services = set(node.get("services", []))
    spec = VEHICLES.get(fleet.get("vehicle"), VEHICLES["truck"])
    region = REGIONS.get(fleet.get("region"), REGIONS[SERVER_CONFIG["region"]])
    price = float(node.get("_fuelPrice") or region["fuelPrice"])

    if action == "save":
        pos = body.get("pos")
        if isinstance(pos, list) and len(pos) == 3:
            try:
                fleet["pos"] = [max(-400.0, min(400.0, float(v))) for v in pos]
            except (TypeError, ValueError):
                pass
        heading = body.get("heading")
        if isinstance(heading, (int, float)):
            fleet["heading"] = float(heading) % 6.2832
        fuel = body.get("fuel")
        if isinstance(fuel, (int, float)):
            fleet["fuel"] = round(max(0.0, min(spec["tank"], float(fuel))), 2)
        condition = body.get("condition")
        if isinstance(condition, (int, float)):
            fleet["condition"] = round(max(0.0, min(100.0, float(condition))), 2)
        odometer = body.get("odometer")
        if isinstance(odometer, (int, float)):
            fleet["odometer"] = round(max(fleet.get("odometer", 0.0), float(odometer)), 2)
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet)}

    if action == "travel":
        return fleet_travel(fleet, str(body.get("to") or ""))

    if action == "refuel":
        if "fuel" not in services:
            raise ApiError(409, "There is no fuel station at this stop")
        litres = body.get("litres")
        try:
            litres = float(litres)
        except (TypeError, ValueError):
            litres = spec["tank"] - fleet["fuel"]
        litres = max(0.0, min(spec["tank"] - fleet["fuel"], litres))
        if litres <= 0.01:
            raise ApiError(409, "The tank is already full")
        cost = round(litres * price, 2)
        if cost > fleet["cash"]:
            raise ApiError(402, f"Not enough cash: {litres:.1f} L costs {cost:.0f} {region['currency']}")
        fleet["fuel"] = round(fleet["fuel"] + litres, 2)
        fleet["cash"] = round(fleet["cash"] - cost, 2)
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "litres": round(litres, 2), "cost": cost}

    if action == "pour_jerrycan":
        cans = int(fleet.get("cargo", {}).get("jerrycan", 0))
        if cans < 1:
            raise ApiError(409, "No jerrycan in the cargo")
        if fleet["fuel"] >= spec["tank"] - 0.5:
            raise ApiError(409, "The tank is already full")
        fleet["cargo"]["jerrycan"] = cans - 1
        if fleet["cargo"]["jerrycan"] <= 0:
            fleet["cargo"].pop("jerrycan", None)
        fleet["fuel"] = round(min(spec["tank"], fleet["fuel"] + 20.0), 2)
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "litres": 20.0, "cost": 0}

    if action == "repair":
        if "garage" not in services:
            raise ApiError(409, "No workshop here — find a garage or call a rescue")
        damage = max(0.0, 100.0 - fleet.get("condition", 100))
        if damage < 0.5:
            raise ApiError(409, "The vehicle needs no repair")
        cost = round(damage * 18.0, 2)
        if cost > fleet["cash"]:
            raise ApiError(402, f"A full repair costs {cost:.0f} {region['currency']} and you have {fleet['cash']:.0f}")
        fleet["condition"] = 100.0
        fleet["cash"] = round(fleet["cash"] - cost, 2)
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "cost": cost}

    if action == "buy":
        if "parts" not in services:
            raise ApiError(409, "No parts merchant here")
        part_key = str(body.get("part") or "")
        if part_key not in PARTS:
            raise ApiError(400, "Unknown part")
        qty = max(1, min(20, int(body.get("qty") or 1)))
        part = PARTS[part_key]
        if fleet_cargo_kg(fleet) + part["kg"] * qty > spec["capacity"]:
            raise ApiError(409, "The load would exceed the cargo capacity")
        cost = round(part["price"] * qty, 2)
        if cost > fleet["cash"]:
            raise ApiError(402, f"Not enough cash for {qty}× {part['en']}")
        fleet["cargo"][part_key] = int(fleet["cargo"].get(part_key, 0)) + qty
        fleet["cash"] = round(fleet["cash"] - cost, 2)
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "cost": cost, "part": part_key, "qty": qty}

    if action == "sell":
        if "parts" not in services and "scrapyard" not in services:
            raise ApiError(409, "Nobody here buys parts")
        part_key = str(body.get("part") or "")
        if part_key not in PARTS or int(fleet.get("cargo", {}).get(part_key, 0)) < 1:
            raise ApiError(409, "That is not in the cargo")
        qty = max(1, min(int(fleet["cargo"].get(part_key, 0)), int(body.get("qty") or 1)))
        earned = round(PARTS[part_key]["price"] * 0.55 * qty, 2)
        fleet["cargo"][part_key] = int(fleet["cargo"][part_key]) - qty
        if fleet["cargo"][part_key] <= 0:
            fleet["cargo"].pop(part_key, None)
        fleet["cash"] = round(fleet["cash"] + earned, 2)
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "earned": earned, "part": part_key, "qty": qty}

    if action == "tow":
        world = WORLD.get(fleet.get("region")) or WORLD[SERVER_CONFIG["region"]]
        garages = [n for n in world["nodes"] if "garage" in n["services"]]
        if not garages:
            raise ApiError(409, "No workshop answers in this region")
        here = _find_node(fleet)
        hx, hz = (here or {}).get("x", 0), (here or {}).get("z", 0)
        nearest = min(garages, key=lambda g: (g["x"] - hx) ** 2 + (g["z"] - hz) ** 2)
        km = round(max(8.0, math.hypot(nearest["x"] - hx, nearest["z"] - hz) * 1.35 * 0.4), 1)
        cost = round(220.0 + km * 0.9, 2)
        if cost > fleet["cash"]:
            raise ApiError(402, f"The tow costs {cost:.0f} {region['currency']} and you have {fleet['cash']:.0f}")
        fleet["cash"] = round(fleet["cash"] - cost, 2)
        fleet["node"] = nearest["id"]
        fleet["odometer"] = round(fleet.get("odometer", 0.0) + km, 2)
        fleet["rescues"] = int(fleet.get("rescues", 0)) + 1
        fleet["pos"] = [0.0, 0.0, 0.0]
        discovered = []
        if _discover(fleet, nearest["id"]):
            discovered.append(nearest["id"])
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "cost": cost, "km": km,
                "to": nearest["id"], "discovered": discovered}

    if action == "buy_vehicle":
        if "market" not in services and "garage" not in services:
            raise ApiError(409, "No dealer here")
        model = str(body.get("vehicle") or "")
        if model not in REGIONS[fleet["region"]]["vehicles"]:
            raise ApiError(400, "That model is not sold in this region")
        spec_new = VEHICLES[model]
        cost = spec_new["price"]
        if cost > fleet["cash"]:
            raise ApiError(402, f"The {spec_new['name']} costs {cost} {region['currency']}")
        if spec_new["capacity"] < fleet_cargo_kg(fleet):
            raise ApiError(409, "Sell some cargo first — it will not fit in that vehicle")
        fleet["cash"] = round(fleet["cash"] - cost, 2)
        fleet["vehicle"] = model
        fleet["fuel"] = min(fleet.get("fuel", 0.0), spec_new["tank"])
        save_fleet(fleet)
        return {"fleet": fleet_public(fleet), "cost": cost}

    raise ApiError(404, "Unknown fleet action")


def _visible_to(message: dict, viewer: str | None) -> bool:
    target = message.get("to")
    return target is None or target == viewer


# --------------------------------------------------------------------------- #
# Sanitisers & narrative helpers
# --------------------------------------------------------------------------- #
def sanitize_name(raw, fallback: str = "Wanderer") -> str:
    name = "".join(ch for ch in str(raw or "") if ch.isprintable()).strip()
    name = re.sub(r"\s+", " ", name)[:NAME_MAX]
    return name or fallback


def sanitize_color(raw, fallback: str) -> str:
    return raw if isinstance(raw, str) and HEX_COLOR.match(raw) else fallback


def sanitize_line(raw, limit: int, fallback: str = "") -> str:
    text = "".join(ch for ch in str(raw or "") if ch.isprintable()).strip()
    text = re.sub(r"\s+", " ", text)
    return (text[:limit] or fallback)


def sanitize_stats(raw) -> dict:
    keys = ("might", "wits", "charm", "luck")
    stats = {}
    for key in keys:
        try:
            value = int(raw.get(key, 5)) if isinstance(raw, dict) else 5
        except (TypeError, ValueError):
            value = 5
        stats[key] = max(1, min(20, value))
    return stats


def sanitize_sheet(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    try:
        age = int(raw.get("age", 0))
    except (TypeError, ValueError):
        age = 0
    age = max(0, min(900, age))
    return {
        "age": age,
        "pronouns": sanitize_line(raw.get("pronouns"), 24),
        "occupation": sanitize_line(raw.get("occupation"), 60),
        "origin": sanitize_line(raw.get("origin"), 80),
        "appearance": sanitize_line(raw.get("appearance"), 260),
        "weakness": sanitize_line(raw.get("weakness"), 180),
        "fear": sanitize_line(raw.get("fear"), 180),
        "dream": sanitize_line(raw.get("dream"), 180),
        "backstory": sanitize_line(raw.get("backstory"), 700),
        "skin": sanitize_line(raw.get("skin"), 9),
        "hair": sanitize_line(raw.get("hair"), 9),
        "hairStyle": sanitize_line(raw.get("hairStyle"), 12),
        "build": sanitize_line(raw.get("build"), 12),
        "eyeColor": sanitize_line(raw.get("eyeColor"), 9),
        "face": sanitize_line(raw.get("face"), 12),
        "nose": sanitize_line(raw.get("nose"), 12),
        "detail": sanitize_line(raw.get("detail"), 12),
        "preset": sanitize_line(raw.get("preset"), 24),
    }


def normalize_words(text: str) -> list[str]:
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("ascii")
    folded = folded.lower().translate(LEET)
    tokens = re.findall(r"[a-z0-9]+", folded)
    collapsed = [re.sub(r"(.)\1{2,}", r"\1", t) for t in tokens]
    return collapsed


def contains_profanity(text: str) -> str:
    tokens = normalize_words(text)
    for token in tokens:
        if token in PROFANITY:
            return token
    # "f u c k" / "f-u-c-k": join short fragments and compare whole words.
    for start in range(len(tokens)):
        joined = ""
        for token in tokens[start:start + 5]:
            if len(token) > 2:
                break
            joined += token
            if len(joined) >= 4 and joined in PROFANITY:
                return joined
    return ""


def godmode_reason(text: str) -> str:
    for pattern in GODMODE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0)[:70]
    return ""


def metagame_reason(text: str) -> bool:
    lowered = " " + re.sub(r"[^a-z0-9 ]+", " ", str(text or "").lower()) + " "
    return any(f" {marker} " in lowered for marker in META_MARKERS)


def is_loopback(ip: str) -> bool:
    return ip.startswith("127.") or ip in ("::1", "localhost")


# --------------------------------------------------------------------------- #
# Bans & event log
# --------------------------------------------------------------------------- #
def load_bans() -> None:
    global BANS
    try:
        with open(BANS_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            BANS = [b for b in data if isinstance(b, dict)]
    except (OSError, json.JSONDecodeError):
        BANS = []


def save_bans() -> None:
    with BANS_LOCK:
        snapshot = list(BANS)
    tmp = f"{BANS_FILE}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(snapshot, handle, indent=2, ensure_ascii=False)
        os.replace(tmp, BANS_FILE)
    except OSError as exc:
        print(f"  ! Could not write ban list: {exc}", file=sys.stderr)


def log_event(kind: str, text: str, detail: str = "") -> None:
    entry = {
        "ts": round(time.time()),
        "time": time.strftime("%H:%M:%S"),
        "kind": kind,
        "text": text,
        "detail": detail,
    }
    with EVENTS_LOCK:
        EVENTS.appendleft(entry)
    icons = {"ban": "⛔", "kick": "⏏", "warn": "!", "join": "→", "leave": "←", "admin": "★"}
    icon = icons.get(kind, "·")
    if kind in ("ban", "kick", "warn", "admin"):
        print(f"\n  {icon} [{time.strftime('%H:%M:%S')}] {text}" + (f"  ({detail})" if detail else ""))
        print("  aether> ", end="", flush=True)


def ban_matches(client_id: str, name: str, ip: str) -> dict | None:
    with BANS_LOCK:
        for entry in BANS:
            if entry.get("clientId") and entry["clientId"] == client_id:
                return entry
            if entry.get("name") and entry["name"].casefold() == (name or "").casefold():
                return entry
            if entry.get("ip") and entry["ip"] == ip and not is_loopback(ip):
                return entry
    return None


def add_ban(player: Player, reason: str, by: str = "wardens") -> dict:
    entry = {
        "id": uuid.uuid4().hex[:8],
        "clientId": player.client_id,
        "name": player.name,
        "ip": player.ip,
        "reason": reason,
        "by": by,
        "when": round(time.time()),
        "whenText": time.strftime("%Y-%m-%d %H:%M"),
    }
    with BANS_LOCK:
        BANS.append(entry)
    STATS["banned"] += 1
    save_bans()
    log_event("ban", f"Banned {player.name}", f"{reason} · {player.ip}")
    return entry


def remove_ban(ban_id: str) -> bool:
    with BANS_LOCK:
        before = len(BANS)
        BANS[:] = [b for b in BANS if b.get("id") != ban_id]
        removed = len(BANS) != before
    if removed:
        save_bans()
    return removed


def issue_ban(room: Room, player: Player, reason: str, by: str = "console") -> None:
    add_ban(player, reason, by)
    room.remove_player(player.id, reason="ban")


def make_player(payload: dict, ip: str) -> Player:
    payload = payload if isinstance(payload, dict) else {}
    cls = payload.get("cls")
    client_id = SAFE_ID.sub("", str(payload.get("clientId") or ""))[:64] or uuid.uuid4().hex
    return Player(
        name=sanitize_name(payload.get("name")),
        cls=cls if cls in CLASSES else "Adventurer",
        color=sanitize_color(payload.get("color"), "#7dd3fc"),
        accent=sanitize_color(payload.get("accent"), "#f0abfc"),
        stats=sanitize_stats(payload.get("stats")),
        sheet=sanitize_sheet(payload.get("sheet")),
        client_id=client_id,
        ip=ip,
    )


def roll_dice(spec: str):
    match = DICE_RE.match(spec.strip())
    if not match:
        return None
    count = int(match.group(1) or 1)
    sides = int(match.group(2))
    sign = match.group(3)
    mod = int(match.group(4) or 0)
    if sign == "-":
        mod = -mod
    if not (1 <= count <= 20) or not (2 <= sides <= 100):
        return None
    rolls = [random.randint(1, sides) for _ in range(count)]
    total = sum(rolls) + mod
    return {"count": count, "sides": sides, "mod": mod, "rolls": rolls, "total": total}


def reap_loop() -> None:
    while True:
        time.sleep(3)
        now = time.time()
        with ROOMS_LOCK:
            for code, room in list(ROOMS.items()):
                room.reap()
                if not room.players and now - room.last_active > ROOM_IDLE_TIMEOUT:
                    ROOMS.pop(code, None)


def find_player_global(player_id: str = "", name: str = "") -> tuple[Room, Player] | tuple[None, None]:
    with ROOMS_LOCK:
        rooms = list(ROOMS.values())
    for room in rooms:
        with room.lock:
            if player_id:
                player = room.players.get(player_id)
                if player:
                    return room, player
            if name:
                for player in room.players.values():
                    if player.name.casefold() == name.casefold():
                        return room, player
    return None, None


def admin_state() -> dict:
    with ROOMS_LOCK:
        rooms_snapshot = list(ROOMS.values())
    rooms = []
    for room in rooms_snapshot:
        with room.lock:
            players = [{
                "id": p.id,
                "name": p.name,
                "cls": p.cls,
                "ip": p.ip,
                "weapon": p.weapon,
                "strikes": p.strikes,
                "joined": round(p.joined),
                "lastSeen": round(p.last_seen),
                "age": p.sheet.get("age", 0),
                "fear": p.fear_state()["active"],
            } for p in room.players.values()]
            rooms.append({
                "code": room.code,
                "name": room.name,
                "theme": room.theme,
                "locked": bool(room.password),
                "players": players,
                "messages": len(room.messages),
            })
    with BANS_LOCK:
        bans = list(BANS)
    with EVENTS_LOCK:
        log = list(EVENTS)[:80]
    world = WORLD.get(SERVER_CONFIG["region"], {})
    return {
        "ok": True,
        "app": APP_NAME,
        "version": VERSION,
        "uptime": int(time.time() - STARTED),
        "filter": FILTER_MODE,
        "config": {
            "region": SERVER_CONFIG["region"],
            "regionName": REGIONS[SERVER_CONFIG["region"]]["name"],
            "name": SERVER_CONFIG["name"],
            "language": SERVER_CONFIG["language"],
            "slots": SERVER_CONFIG["slots"],
            "modules": SERVER_CONFIG["modules"],
            "timezone": REGIONS[SERVER_CONFIG["region"]]["timezone"],
            "database": DB_PATH,
        },
        "world": {
            "nodes": len(world.get("nodes", [])),
            "roads": len(world.get("roads", [])),
            "fleet": len(FLEET),
            "models": len(world.get("vehicles", [])),
        },
        "rooms": rooms,
        "bans": bans,
        "log": log,
        "totals": {
            "rooms": len(rooms),
            "players": sum(len(r["players"]) for r in rooms),
            "bans": len(bans),
            "joins": STATS["joins"],
            "messages": STATS["messages"],
        },
    }


def _is_private_address(value: str) -> bool:
    """True for loopback / LAN / link-local peers — i.e. a local proxy."""
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local


# --------------------------------------------------------------------------- #
# HTTP plumbing
# --------------------------------------------------------------------------- #
class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class Handler(BaseHTTPRequestHandler):
    server_version = f"{APP_NAME}/{VERSION}"
    protocol_version = "HTTP/1.1"

    # -- helpers ----------------------------------------------------------- #
    def log_message(self, fmt, *args):  # keep the console readable
        if os.environ.get("AETHERHOLD_VERBOSE"):
            super().log_message(fmt, *args)

    @property
    def client_ip(self) -> str:
        """The player's real address, even behind a reverse proxy.

        Render, Northflank, Railway and Docker front the process with a private
        load balancer, so the socket peer is the proxy and every player would
        look identical (one ban would bar the whole hall). When the peer is a
        private or loopback address we take the first hop of X-Forwarded-For;
        a direct public peer cannot spoof it because the header is ignored.
        """
        peer = self.client_address[0] if self.client_address else "?"
        forwarded = self.headers.get("X-Forwarded-For") if self.headers else None
        if forwarded and _is_private_address(peer):
            first = forwarded.split(",")[0].strip()
            if first:
                return first
        return peer

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _html(self, body: str, status=200):
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _error(self, status, message):
        self._json({"ok": False, "error": message}, status)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        if length > 64_000:
            raise ApiError(413, "Payload too large")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(400, "Invalid JSON body")
        if not isinstance(data, dict):
            raise ApiError(400, "Expected a JSON object")
        return data

    def _is_admin(self) -> bool:
        key = self.headers.get("X-Admin-Key") or ""
        if not key:
            query = parse_qs(urlparse(self.path).query)
            key = (query.get("key") or [""])[0]
        if not key:
            return False
        with BANS_LOCK:
            until = ADMIN_SESSIONS.get(key)
            if until and until > time.time():
                return True
            if until:
                ADMIN_SESSIONS.pop(key, None)
        return bool(ADMIN_KEY) and hmac.compare_digest(key, ADMIN_KEY)

    def _login_admin(self):
        body = self._body()
        ip = self.client_ip
        now = time.time()
        with BANS_LOCK:
            recent = [ts for ts in LOGIN_FAILS.get(ip, []) if now - ts < 60]
            LOGIN_FAILS[ip] = recent
            if len(recent) >= 6:
                raise ApiError(429, "Too many failed attempts — wait a minute")
        password = str(body.get("password") or "")
        if not ADMIN_PASSWORD or not hmac.compare_digest(password, ADMIN_PASSWORD):
            with BANS_LOCK:
                LOGIN_FAILS.setdefault(ip, []).append(now)
            log_event("warn", "Failed warden login", ip)
            raise ApiError(401, "That password does not open the panel")
        token = secrets.token_urlsafe(24)
        with BANS_LOCK:
            ADMIN_SESSIONS[token] = now + 8 * 3600
        log_event("admin", "Warden signed in to the panel", ip)
        return self._json({"ok": True, "token": token, "state": admin_state()})

    def _require_admin(self) -> None:
        if not self._is_admin():
            raise ApiError(401, "The admin key is missing or wrong")

    # -- verbs ------------------------------------------------------------- #
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        try:
            if path == "/admin":
                return self._html(ADMIN_PAGE)
            if path.startswith("/api/"):
                return self._api_get(path)
            return self._static(path)
        except ApiError as exc:
            return self._error(exc.status, exc.message)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        except Exception as exc:  # pragma: no cover - defensive
            return self._error(500, f"Server error: {exc}")

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        try:
            if not path.startswith("/api/"):
                raise ApiError(404, "Not found")
            return self._api_post(path)
        except ApiError as exc:
            return self._error(exc.status, exc.message)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        except Exception as exc:  # pragma: no cover - defensive
            return self._error(500, f"Server error: {exc}")

    # -- static ------------------------------------------------------------ #
    def _static(self, path: str):
        if path in ("/", ""):
            path = "/index.html"
        relative = os.path.normpath(path.lstrip("/")).replace("\\", "/")
        if relative.startswith("..") or os.path.isabs(relative):
            raise ApiError(403, "Forbidden")
        target = os.path.join(PUBLIC_DIR, relative)
        if not os.path.isfile(target):
            raise ApiError(404, "Not found")
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(target, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    # -- API --------------------------------------------------------------- #
    def _api_get(self, path: str):
        if path == "/api/health":
            return self._json({
                "ok": True,
                "app": APP_NAME,
                "version": VERSION,
                "rooms": len(ROOMS),
                "themes": THEMES,
                "filter": FILTER_MODE,
                "admin": "/admin",
                "region": SERVER_CONFIG["region"],
                "regionName": REGIONS[SERVER_CONFIG["region"]]["name"],
                "serverName": SERVER_CONFIG["name"],
                "language": SERVER_CONFIG["language"],
                "modules": SERVER_CONFIG["modules"],
                "timezone": REGIONS[SERVER_CONFIG["region"]]["timezone"],
                "world": WORLD.get(SERVER_CONFIG["region"], {}).get("name"),
            })
        if path == "/api/world":
            query = parse_qs(urlparse(self.path).query)
            key = (query.get("region") or [SERVER_CONFIG["region"]])[0]
            if key not in WORLD:
                raise ApiError(404, "Unknown region")
            return self._json({"ok": True, "world": WORLD[key],
                               "modules": SERVER_CONFIG["modules"],
                               "serverName": SERVER_CONFIG["name"]})
        if path == "/api/fleet":
            query = parse_qs(urlparse(self.path).query)
            client_id = SAFE_ID.sub("", (query.get("client") or [""])[0])[:64]
            if not client_id:
                raise ApiError(400, "A client id is required")
            fleet = get_fleet(client_id)
            return self._json({"ok": True, "fleet": fleet_public(fleet),
                               "models": WORLD.get(fleet["region"], {}).get("vehicles", [])})
        if path == "/api/rooms":
            with ROOMS_LOCK:
                rooms = [room.info() for room in ROOMS.values()]
            rooms.sort(key=lambda r: (r["players"] == 0, -r["players"], r["name"].lower()))
            return self._json({"ok": True, "rooms": rooms})
        if path == "/api/codex":
            return self._json({"ok": True, "codex": CODEX, "filter": FILTER_MODE})
        if path == "/api/mods":
            return self._json({
                "ok": True,
                "mods": [mod.info() for mod in MODS.values()],
                "commands": sorted(MOD_COMMANDS),
                "errors": MOD_ERRORS[-12:],
            })
        if path == "/api/admin/state":
            self._require_admin()
            return self._json(admin_state())
        raise ApiError(404, "Unknown endpoint")

    def _api_post(self, path: str):
        parts = [p for p in path.split("/") if p]
        if parts == ["api", "admin", "action"]:
            return self._admin_action()
        if parts == ["api", "admin", "login"]:
            return self._login_admin()
        if parts == ["api", "fleet"]:
            body = self._body()
            client_id = SAFE_ID.sub("", str(body.get("clientId") or ""))[:64]
            if not client_id:
                raise ApiError(400, "A client id is required")
            return self._json({"ok": True, **fleet_action(client_id, body)})
        if parts == ["api", "rooms"]:
            return self._create_room()
        if len(parts) == 4 and parts[:2] == ["api", "rooms"]:
            return self._room_action(parts[2].upper(), parts[3])
        raise ApiError(404, "Unknown endpoint")

    # -- admin actions ------------------------------------------------------ #
    def _admin_action(self):
        global FILTER_MODE
        self._require_admin()
        body = self._body()
        action = str(body.get("action") or "")
        if action == "kick":
            room, player = self._resolve_target(body)
            if not player:
                raise ApiError(404, "No such player")
            room.remove_player(player.id, reason="kick")
            log_event("kick", f"Kicked {player.name} from {room.code}", str(body.get("reason") or ""))
            return self._json({"ok": True, "state": admin_state()})
        if action == "ban":
            room, player = self._resolve_target(body)
            if not player:
                raise ApiError(404, "No such player")
            issue_ban(room, player, str(body.get("reason") or "host decision")[:120], by="admin panel")
            return self._json({"ok": True, "state": admin_state()})
        if action == "unban":
            if not remove_ban(str(body.get("banId") or "")):
                raise ApiError(404, "No such ban")
            log_event("admin", "Ban lifted", str(body.get("banId") or ""))
            return self._json({"ok": True, "state": admin_state()})
        if action == "broadcast":
            text = sanitize_line(body.get("text"), MAX_MESSAGE_LENGTH)
            if not text:
                raise ApiError(400, "Nothing to announce")
            code = str(body.get("room") or "").upper()
            with ROOMS_LOCK:
                rooms = [ROOMS[code]] if code in ROOMS else list(ROOMS.values())
            for room in rooms:
                room.broadcast({"kind": "system", "from": None, "text": f"[Wardens] {text}"})
            log_event("admin", f"Announced to {len(rooms)} room(s)", text[:80])
            return self._json({"ok": True, "state": admin_state()})
        if action == "filter":
            mode = str(body.get("mode") or "")
            if mode not in ("ban", "log", "off"):
                raise ApiError(400, "mode must be ban, log or off")
            FILTER_MODE = mode
            log_event("admin", f"Profanity filter set to {mode}", "admin panel")
            return self._json({"ok": True, "state": admin_state()})
        if action == "clearLog":
            with EVENTS_LOCK:
                EVENTS.clear()
            return self._json({"ok": True, "state": admin_state()})
        raise ApiError(404, "Unknown admin action")

    def _resolve_target(self, body: dict) -> tuple[Room, Player] | tuple[None, None]:
        code = str(body.get("room") or "").upper()
        player_id = str(body.get("playerId") or "")
        name = str(body.get("name") or "")
        if code:
            with ROOMS_LOCK:
                room = ROOMS.get(code)
            if not room:
                raise ApiError(404, "No such room")
            with room.lock:
                player = room.players.get(player_id) if player_id else None
                if not player and name:
                    player = next((p for p in room.players.values()
                                   if p.name.casefold() == name.casefold()), None)
            return room, player
        return find_player_global(player_id, name)

    # -- rooms -------------------------------------------------------------- #
    def _create_room(self):
        body = self._body()
        theme = body.get("theme")
        name = sanitize_name(body.get("name"), "The Wanderer's Rest")
        try:
            max_players = int(body.get("maxPlayers", 8))
        except (TypeError, ValueError):
            max_players = 8
        max_players = max(2, min(MAX_PLAYERS_LIMIT, max_players))
        password = str(body.get("password") or "")[:40]
        theme = theme if theme in THEMES else "ember"

        payload = body.get("player") if isinstance(body.get("player"), dict) else {}
        client_id = SAFE_ID.sub("", str(payload.get("clientId") or ""))[:64]
        wanted_name = sanitize_name(payload.get("name"))
        banned = ban_matches(client_id, wanted_name, self.client_ip)
        if banned:
            return self._banned(banned)
        if contains_profanity(wanted_name):
            raise ApiError(400, "That name breaks the wardens' law — choose another")

        room = Room(name, max_players, password, theme)
        with ROOMS_LOCK:
            if len(ROOMS) >= 200:
                raise ApiError(503, "The realm is full — too many rooms")
            ROOMS[room.code] = room

        player = make_player(payload, self.client_ip)
        room.add_player(player)
        STATS["joins"] += 1
        log_event("join", f"{player.name} opened {room.name} ({room.code})", player.ip)
        return self._json({
            "ok": True,
            "code": room.code,
            "playerId": player.id,
            "token": player.token,
            "room": room.snapshot(player.id),
        })

    def _banned(self, ban: dict):
        log_event("warn", f"Rejected barred client {ban.get('name')}", str(ban.get("reason") or ""))
        raise ApiError(403, f"You are barred from this realm ({ban.get('reason') or 'wardens law'}).")

    def _room_action(self, code: str, action: str):
        with ROOMS_LOCK:
            room = ROOMS.get(code)
        if room is None:
            raise ApiError(404, "No such room — it may have closed")

        if action == "join":
            return self._join(room)
        if action == "sync":
            return self._sync(room)
        if action == "chat":
            return self._chat(room)
        if action == "leave":
            return self._leave(room)
        raise ApiError(404, "Unknown room action")

    def _join(self, room: Room):
        body = self._body()
        payload = body.get("player") if isinstance(body.get("player"), dict) else {}
        client_id = SAFE_ID.sub("", str(payload.get("clientId") or ""))[:64]
        wanted_name = sanitize_name(payload.get("name"))
        banned = ban_matches(client_id, wanted_name, self.client_ip)
        if banned:
            return self._banned(banned)
        if contains_profanity(wanted_name):
            raise ApiError(400, "That name breaks the wardens' law — choose another")

        with room.lock:
            if len(room.players) >= room.max_players:
                raise ApiError(409, "That room is full")
            if room.password and str(body.get("password") or "") != room.password:
                raise ApiError(403, "That password does not match the ward")
            player = make_player(payload, self.client_ip)
            room.add_player(player)
            snapshot = room.snapshot(player.id)
        STATS["joins"] += 1
        log_event("join", f"{player.name} entered {room.name} ({room.code})", player.ip)
        mods_emit("join", room=room, player=player)
        return self._json({
            "ok": True,
            "code": room.code,
            "playerId": player.id,
            "token": player.token,
            "room": snapshot,
        })

    def _require_player(self, room: Room, body: dict) -> Player:
        player = room.find_by_token(str(body.get("token") or ""))
        if player is None:
            raise ApiError(401, "Your session expired — rejoin the room")
        return player

    def _sync(self, room: Room):
        body = self._body()
        player = self._require_player(room, body)
        since = body.get("since")
        try:
            since = int(since) if since is not None else 0
        except (TypeError, ValueError):
            since = 0

        pos = body.get("pos")
        if isinstance(pos, list) and len(pos) == 3:
            try:
                player.pos = [max(-40.0, min(40.0, float(v))) for v in pos]
            except (TypeError, ValueError):
                pass
        rot = body.get("rot")
        if isinstance(rot, (int, float)):
            player.rot = float(rot) % 6.2832
        pitch = body.get("pitch")
        if isinstance(pitch, (int, float)):
            player.pitch = max(-1.2, min(1.2, float(pitch)))
        look = body.get("look")
        if isinstance(look, (int, float)):
            player.look = float(look) % 6.2832
        anim = body.get("anim")
        if isinstance(anim, str) and anim in ("idle", "walk", "run", "emote"):
            player.anim = anim
        player.last_seen = time.time()

        with room.lock:
            messages = [m for m in room.messages
                        if m.get("seq", 0) > since and _visible_to(m, player.id)]
            payload = {
                "ok": True,
                "seq": room.seq,
                "players": [p.public() for p in room.players.values()],
                "messages": messages,
                "room": {"code": room.code, "name": room.name, "theme": room.theme},
                "fear": player.fear_state(),
            }
        return self._json(payload)

    # -- chat --------------------------------------------------------------- #
    def _chat(self, room: Room):
        body = self._body()
        player = self._require_player(room, body)
        now = time.time()
        if now - player.last_chat < CHAT_COOLDOWN:
            raise ApiError(429, "Slow down, adventurer")
        player.last_chat = now

        text = str(body.get("text") or "").replace("\r", " ").replace("\n", " ").strip()
        if not text:
            raise ApiError(400, "Say something first")
        text = text[:MAX_MESSAGE_LENGTH]

        # 1. Spam guard: repeated identical lines and burst flooding.
        bare = re.sub(r"\s+", " ", text.lower())
        if player.recent and list(player.recent).count(bare) >= 2:
            player.strikes += 1
            log_event("warn", f"Spam from {player.name}", bare[:60])
            if player.strikes >= 2:
                room.remove_player(player.id, reason="kick")
                raise ApiError(429, "You were removed for spamming")
            raise ApiError(429, "Do not repeat the same line — say something new")
        player.recent.append(bare)

        # 2. Profanity: automatic, permanent, recorded.
        found = contains_profanity(text)
        if found:
            if FILTER_MODE == "off":
                pass
            elif FILTER_MODE == "log":
                log_event("warn", f"Profanity from {player.name} (logged, not banned)", found)
            else:
                issue_ban(room, player, f"profanity: {found}", by="wardens")
                raise ApiError(403, "You have been barred from the realm for profanity.")

        # 3. OOC is always allowed and always separated from the fiction.
        ooc = text[4:].strip() if text.lower().startswith("/ooc") else ""
        if ooc:
            message = room.broadcast({
                "kind": "ooc", "from": player.id, "name": player.name,
                "color": player.accent, "text": ooc[:MAX_MESSAGE_LENGTH],
            })
            STATS["messages"] += 1
            return self._json({"ok": True, "message": message})

        # 4. Commands.
        if text.startswith("/"):
            handled = self._command(room, player, text)
            if handled is not None:
                return handled
            raise ApiError(400, "Unknown command — /help lists them all")

        # 5. In-character guards.
        godmode = godmode_reason(text)
        if godmode:
            player.strikes += 1
            log_event("warn", f"Godmoding blocked in {room.code}", f"{player.name}: {text[:80]}")
            raise ApiError(422, (
                "That decides another character's fate, so it was not sent. "
                "Describe your intent and let them react — or use /try. "
                "Codex 3: no godmoding."
            ))
        if metagame_reason(text):
            player.strikes += 1
            log_event("warn", f"Metagaming blocked in {room.code}", f"{player.name}: {text[:80]}")
            raise ApiError(422, (
                "That is out-of-character knowledge leaking into the scene. "
                "Put it in /ooc, or find it out in play. Codex 5: no metagaming."
            ))

        message = room.broadcast({
            "kind": "chat",
            "from": player.id,
            "name": player.name,
            "color": player.color,
            "accent": player.accent,
            "text": text,
        })
        STATS["messages"] += 1
        mods_emit("chat", room=room, player=player, text=text)
        return self._json({"ok": True, "message": message})

    def _command(self, room: Room, player: Player, text: str):
        lowered = text.lower()

        roll = roll_dice(text)
        if roll:
            modifier = roll["mod"]
            mod_text = f" {modifier:+d}" if modifier else ""
            dice_text = ", ".join(str(r) for r in roll["rolls"])
            message = room.broadcast({
                "kind": "roll",
                "from": player.id,
                "name": player.name,
                "color": player.color,
                "text": f"rolls {roll['count']}d{roll['sides']}{mod_text}  →  {roll['total']}",
                "detail": f"[{dice_text}]{mod_text}",
                "roll": roll,
            })
            STATS["messages"] += 1
            return self._json({"ok": True, "message": message})

        for prefix in ("/me ", "/em ", "/emote "):
            if lowered.startswith(prefix):
                action = text[len(prefix):].strip()[:MAX_MESSAGE_LENGTH]
                if not action:
                    break
                if godmode_reason(action):
                    raise ApiError(422, (
                        "An emote may not declare another character's wound or death. "
                        "Offer the action, then let them answer — /try is built for this."
                    ))
                message = room.broadcast({
                    "kind": "emote",
                    "from": player.id,
                    "name": player.name,
                    "color": player.accent,
                    "text": action,
                })
                STATS["messages"] += 1
                return self._json({"ok": True, "message": message})

        if lowered.startswith("/try ") or lowered.startswith("/attempt "):
            action = text.split(" ", 1)[1].strip()[:MAX_MESSAGE_LENGTH]
            if not action:
                raise ApiError(400, "Try what?")
            if godmode_reason(action):
                raise ApiError(422, "A /try still may not dictate their wound — state your attempt only.")
            best = max(player.stats.items(), key=lambda kv: kv[1])
            bonus = max(0, (best[1] - 5) // 2)
            die = random.randint(1, 20)
            total = die + bonus
            verdict = ("clean success" if total >= 16 else "partial success" if total >= 11
                       else "the attempt fails" if total >= 6 else "it goes badly wrong")
            message = room.broadcast({
                "kind": "try",
                "from": player.id,
                "name": player.name,
                "color": player.color,
                "text": action,
                "detail": f"d20 {die} {bonus:+d} = {total} — {verdict}",
                "roll": {"total": total, "rolls": [die], "mod": bonus, "sides": 20, "count": 1},
            })
            STATS["messages"] += 1
            return self._json({"ok": True, "message": message})

        if lowered.startswith("/draw"):
            weapon = text[5:].strip().lower() or "blade"
            if weapon not in ("blade", "sword", "bow", "staff", "axe", "knife", "dagger", "spear"):
                weapon = "blade"
            player.weapon = "blade" if weapon in ("sword", "knife", "dagger") else weapon
            threatened = room.others_near(player, FEAR_RADIUS)
            until = time.time() + FEAR_SECONDS
            for other in threatened:
                other.fear_due = until
                other.fear_by = player.name
            message = room.broadcast({
                "kind": "threat",
                "from": player.id,
                "name": player.name,
                "color": player.color,
                "text": f"draws a {player.weapon}.",
                "detail": (f"{len(threatened)} within reach must answer with /fear"
                           if threatened else "the plaza is empty of witnesses"),
            })
            STATS["messages"] += 1
            return self._json({"ok": True, "message": message})

        if lowered == "/sheathe":
            player.weapon = ""
            message = room.broadcast({
                "kind": "system", "from": None,
                "text": f"{player.name} sheathes their weapon. The room breathes again.",
            })
            return self._json({"ok": True, "message": message})

        if lowered.startswith("/fear"):
            reaction = text[5:].strip()
            was_afraid = player.fear_due > time.time()
            player.fear_due = 0.0
            player.fear_by = ""
            body = reaction or "freezes, hands open, breath short."
            message = room.broadcast({
                "kind": "fear",
                "from": player.id,
                "name": player.name,
                "color": player.accent,
                "text": body,
                "detail": "answers the drawn steel" if was_afraid else "shows fear",
            })
            return self._json({"ok": True, "message": message})

        if lowered.startswith("/look ") or lowered.startswith("/examine "):
            wanted = text.split(" ", 1)[1].strip().lstrip("@")
            with room.lock:
                target = next((p for p in room.players.values()
                               if p.name.casefold() == wanted.casefold()), None)
            if not target:
                raise ApiError(404, f"No one called {wanted} is here")
            message = room.broadcast({
                "kind": "sheet",
                "from": None,
                "to": player.id,
                "name": target.name,
                "color": target.color,
                "sheet": {**target.sheet, "name": target.name, "cls": target.cls,
                          "stats": target.stats, "weapon": target.weapon},
                "text": target.name,
            })
            return self._json({"ok": True, "message": message})

        if lowered == "/sheet":
            message = room.broadcast({
                "kind": "sheet",
                "from": None,
                "to": player.id,
                "name": player.name,
                "color": player.color,
                "sheet": {**player.sheet, "name": player.name, "cls": player.cls,
                          "stats": player.stats, "weapon": player.weapon},
                "text": player.name,
            })
            return self._json({"ok": True, "message": message})

        if lowered in ("/who", "/list"):
            with room.lock:
                names = ", ".join(
                    f"{p.name} ({p.cls}" + (f", {p.weapon} drawn" if p.weapon else "") + ")"
                    for p in room.players.values())
            message = room.broadcast({
                "kind": "system", "from": None,
                "to": player.id,
                "text": f"Present: {names or 'nobody'}",
            })
            return self._json({"ok": True, "message": message})

        if lowered in ("/rules", "/codex"):
            message = room.broadcast({
                "kind": "system", "from": None, "to": player.id, "text": SHORT_RULES,
            })
            return self._json({"ok": True, "message": message})

        if lowered in ("/help", "/?"):
            with room.lock:
                commands = " · ".join(item["cmd"] for item in CODEX["commands"])
            extra = " · ".join(f"/{name}" for name in sorted(MOD_COMMANDS))
            message = room.broadcast({
                "kind": "system", "from": None, "to": player.id,
                "text": f"Commands: {commands}" + (f" · mods: {extra}" if extra else ""),
            })
            return self._json({"ok": True, "message": message})

        # 6. Mod / extension commands, loaded from ./mods at boot.
        mod_result = mods_command(room, player, text)
        if mod_result is not None:
            return self._json(mod_result)

        return None

    def _leave(self, room: Room):
        body = self._body()
        with room.lock:
            player = room.find_by_token(str(body.get("token") or ""))
            if player is not None:
                player.weapon = ""
                player.fear_due = 0.0
                room.remove_player(player.id)
                log_event("leave", f"{player.name} left {room.code}", player.ip)
                mods_emit("leave", room=room, player=player)
        return self._json({"ok": True})


# --------------------------------------------------------------------------- #
# Admin control panel (served at /admin, protected by the admin key)
# --------------------------------------------------------------------------- #
ADMIN_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Aetherhold — Warden's Panel</title>
<style>
  :root { --ink:#080810; --panel:#11111f; --line:rgba(242,201,125,.2); --gold:#f2c97d;
          --text:#ece9f7; --muted:#9b97b6; --danger:#ff7b7b; --ok:#7ee0a8; }
  * { box-sizing:border-box; }
  body { margin:0; background:radial-gradient(900px 500px at 20% 0%,#1a1428,#07070d 70%);
         color:var(--text); font:14px/1.5 "Inter","Segoe UI",system-ui,sans-serif; min-height:100vh; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px;
           padding:16px 22px; border-bottom:1px solid var(--line); background:rgba(10,10,18,.85);
           position:sticky; top:0; z-index:5; backdrop-filter:blur(10px); flex-wrap:wrap; }
  h1 { margin:0; font:500 19px/1.2 "Cinzel",Georgia,serif; letter-spacing:.16em; color:#fff4dd; }
  h1 span { color:var(--gold); }
  h2 { margin:0 0 10px; font:600 11px/1.4 inherit; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); }
  .wrap { padding:18px 22px 60px; max-width:1240px; margin:0 auto; display:grid; gap:16px; }
  .grid { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(0,1fr); gap:16px; align-items:start; }
  .card { border:1px solid var(--line); border-radius:14px; background:linear-gradient(170deg,rgba(24,22,40,.9),rgba(10,10,18,.94));
          padding:16px; box-shadow:0 18px 48px rgba(0,0,0,.45); }
  .stats { display:flex; gap:22px; flex-wrap:wrap; }
  .stats div { display:grid; }
  .stats b { font:600 22px/1.1 inherit; color:var(--gold); font-variant-numeric:tabular-nums; }
  .stats span { font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; font:600 9.5px/1.4 inherit; letter-spacing:.16em; text-transform:uppercase;
       color:var(--muted); padding:0 8px 8px; border-bottom:1px solid var(--line); }
  td { padding:8px; border-bottom:1px solid rgba(255,255,255,.05); vertical-align:middle; }
  tr:last-child td { border-bottom:0; }
  .room { margin-bottom:14px; border:1px solid rgba(255,255,255,.07); border-radius:10px; overflow:hidden; }
  .room-head { display:flex; gap:10px; align-items:center; padding:9px 12px; background:rgba(242,201,125,.06); flex-wrap:wrap; }
  .room-head strong { letter-spacing:.05em; }
  .code { color:var(--gold); letter-spacing:.2em; font-size:11px; }
  .muted { color:var(--muted); }
  .chip { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:999px;
          border:1px solid rgba(255,255,255,.12); font-size:10px; letter-spacing:.08em; color:var(--muted); }
  button { font:inherit; cursor:pointer; border-radius:8px; border:1px solid var(--line);
           background:rgba(242,201,125,.08); color:var(--gold); padding:5px 10px; font-size:11.5px; }
  button:hover { background:rgba(242,201,125,.18); }
  button.danger { border-color:rgba(255,123,123,.4); color:var(--danger); background:rgba(255,123,123,.07); }
  button.danger:hover { background:rgba(255,123,123,.16); }
  button.ghost { border-color:rgba(255,255,255,.12); color:var(--muted); background:transparent; }
  input, select { font:inherit; font-size:12.5px; padding:7px 9px; border-radius:8px;
                  border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.35); color:var(--text); }
  input:focus, select:focus { outline:none; border-color:var(--line); }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .row > input { flex:1 1 160px; min-width:0; }
  .log { max-height:280px; overflow:auto; font:12px/1.6 "JetBrains Mono",Consolas,monospace; }
  .log div { display:flex; gap:8px; padding:3px 0; border-bottom:1px dashed rgba(255,255,255,.05); }
  .log time { color:#6f6b8c; flex:0 0 auto; }
  .log .k-ban { color:#ff9b9b; } .log .k-kick { color:#ffc38a; }
  .log .k-warn { color:#ffd67e; } .log .k-admin { color:#8fb8ff; }
  .log .k-join { color:#7ee0a8; } .log .k-leave { color:#9b97b6; }
  .empty { padding:16px; text-align:center; color:var(--muted); font-size:12px; }
  .keybar { display:flex; gap:8px; align-items:center; }
  .keybar input { width:190px; }
  .badge-live { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--ok);
                box-shadow:0 0 8px var(--ok); margin-right:6px; }
  .warnbox { border:1px solid rgba(255,123,123,.3); background:rgba(255,123,123,.07);
             border-radius:10px; padding:10px 12px; font-size:12px; color:#ffdada; margin-bottom:12px; }
  #authMsg:empty { display:none; }
  .gate { position:fixed; inset:0; z-index:20; display:grid; place-items:center;
          background:radial-gradient(700px 420px at 50% 20%,#1c1430,#05050b 75%);
          backdrop-filter:blur(6px); }
  .gate.hidden { display:none; }
  .gate-card { width:min(420px,92vw); border:1px solid var(--line); border-radius:16px;
               background:linear-gradient(170deg,rgba(28,24,46,.96),rgba(8,8,15,.98));
               padding:26px 24px; box-shadow:0 30px 80px rgba(0,0,0,.6); }
  .gate-card h1 { font-size:20px; margin-bottom:6px; }
  .gate-card p { color:var(--muted); font-size:12.5px; margin:0 0 18px; }
  .gate-card input { width:100%; margin-bottom:10px; padding:11px 12px; font-size:14px; }
  .gate-card button { width:100%; padding:10px; font-size:13px; }
  .gate-err { color:#ff9b9b; font-size:12px; min-height:16px; margin-top:8px; }
  .gate-foot { margin-top:16px; font-size:11px; color:#6f6b8c; line-height:1.6; }
  .config-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  @media (max-width:960px) { .grid { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <h1>AETHERHOLD <span>· WARDEN'S PANEL</span></h1>
  <div class="keybar">
    <span class="chip"><span class="badge-live"></span><span id="status">connecting</span></span>
    <input id="key" type="password" placeholder="admin key" autocomplete="off" />
    <button id="save-key">Use key</button>
    <button class="ghost" id="refresh">Refresh</button>
  </div>
</header>

<div class="gate" id="gate">
  <form class="gate-card" id="gate-form" autocomplete="off">
    <h1>AETHERHOLD <span style="color:var(--gold)">· WARDENS</span></h1>
    <p>This panel is sealed. Enter the warden's password printed by server.py.</p>
    <input id="gate-password" type="password" placeholder="Warden password" autocomplete="current-password" />
    <button type="submit" id="gate-submit">Unseal the panel</button>
    <div class="gate-err" id="gate-err"></div>
    <div class="gate-foot">Locked out? Run <code>server.py --admin-password ...</code> to set a known password,
      or start the host again to have one printed.</div>
  </form>
</div>

<div class="wrap" id="panel-wrap">
  <div class="card stats">
    <div><b id="t-players">0</b><span>players</span></div>
    <div><b id="t-rooms">0</b><span>rooms</span></div>
    <div><b id="t-bans">0</b><span>bans</span></div>
    <div><b id="t-joins">0</b><span>joins</span></div>
    <div><b id="t-uptime">0m</b><span>uptime</span></div>
    <div style="flex:1"></div>
    <div><b id="t-filter" style="font-size:14px">ban</b><span>profanity filter</span></div>
  </div>

  <div class="config-chips" id="server-config"></div>
  <div id="authMsg"></div>

  <div class="grid">
    <div class="card">
      <h2>Live table</h2>
      <div id="rooms" class="muted">Loading…</div>
    </div>

    <div style="display:grid;gap:16px">
      <div class="card">
        <h2>Wardens' broadcast</h2>
        <div class="row">
          <select id="bc-room"><option value="">All rooms</option></select>
          <input id="bc-text" placeholder="Announcement to the hall" maxlength="400" />
          <button id="bc-send">Send</button>
        </div>
        <div class="row" style="margin-top:12px">
          <span class="muted" style="font-size:12px">Profanity filter</span>
          <select id="filter-mode">
            <option value="ban">ban on sight</option>
            <option value="log">log only</option>
            <option value="off">off</option>
          </select>
          <button id="filter-apply">Apply</button>
        </div>
      </div>

      <div class="card">
        <h2>Ban list</h2>
        <div id="bans" class="muted">Loading…</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Server screen <button class="ghost" id="clear-log" style="float:right">Clear</button></h2>
    <div class="log" id="log"></div>
  </div>
</div>

<script>
(function () {
  const $ = (id) => document.getElementById(id);
  const sessionKey = "aether.admin.session";
  let key = new URLSearchParams(location.search).get("key")
    || sessionStorage.getItem(sessionKey)
    || localStorage.getItem("aether.admin.key") || "";
  $("key").value = key;

  function showGate(message) {
    $("gate").classList.remove("hidden");
    $("gate-err").textContent = message || "";
    setTimeout(() => $("gate-password").focus(), 60);
    $("panel-wrap").style.filter = "blur(2px)";
  }
  function hideGate() {
    $("gate").classList.add("hidden");
    $("panel-wrap").style.filter = "none";
  }

  async function login(password) {
    $("gate-submit").disabled = true;
    $("gate-err").textContent = "checking…";
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || ("HTTP " + res.status));
      key = data.token;
      sessionStorage.setItem(sessionKey, key);
      $("key").value = key;
      hideGate();
      render(data.state);
      $("gate-password").value = "";
    } catch (error) {
      $("gate-err").textContent = error.message;
    } finally {
      $("gate-submit").disabled = false;
    }
  }

  $("gate-form").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("gate-password").value.trim());
  });

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function ago(ts) {
    const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s / 60) + "m";
    return Math.round(s / 3600) + "h";
  }
  function setStatus(text) { $("status").textContent = text; }

  async function api(path, body) {
    const url = path + (path.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key);
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: Object.assign({ "X-Admin-Key": key }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || ("HTTP " + res.status));
    return data;
  }

  async function act(payload) {
    try {
      const data = await api("/api/admin/action", payload);
      render(data.state);
    } catch (error) {
      $("authMsg").innerHTML = '<div class="warnbox">' + esc(error.message) + "</div>";
      setStatus("not authorised");
    }
  }

  function playerRow(room, p) {
    return '<tr>' +
      '<td><strong>' + esc(p.name) + '</strong><div class="muted" style="font-size:11px">' +
        esc(p.cls) + (p.age ? " · age " + p.age : "") + (p.weapon ? ' · <span style="color:var(--danger)">' + esc(p.weapon) + " drawn</span>" : "") +
      "</div></td>" +
      '<td class="muted" style="font-size:11px">' + esc(p.ip) + "<br>seen " + ago(p.lastSeen) +
        (p.strikes ? '<br><span style="color:#ffd67e">' + p.strikes + " strike(s)</span>" : "") + "</td>" +
      '<td style="text-align:right;white-space:nowrap">' +
        '<button class="ghost" data-kick="' + esc(p.id) + '" data-room="' + esc(room) + '">Kick</button> ' +
        '<button class="danger" data-ban="' + esc(p.id) + '" data-room="' + esc(room) + '" data-name="' + esc(p.name) + '">Ban</button>' +
      "</td></tr>";
  }

  function render(state) {
    if (!state) return;
    $("authMsg").innerHTML = "";
    setStatus("live");
    $("t-players").textContent = state.totals.players;
    $("t-rooms").textContent = state.totals.rooms;
    $("t-bans").textContent = state.totals.bans;
    $("t-joins").textContent = state.totals.joins;
    $("t-uptime").textContent = Math.floor(state.uptime / 60) + "m";
    $("t-filter").textContent = state.filter;
    $("filter-mode").value = state.filter;

    const config = $("server-config");
    if (config && state.config) {
      config.innerHTML = '<span class="chip">' + esc(state.config.regionName || state.config.region) + '</span>' +
        '<span class="chip">' + esc(state.config.name || "unnamed server") + '</span>' +
        '<span class="chip">' + esc((state.config.language || "en").toUpperCase()) + '</span>' +
        '<span class="chip">' + state.config.slots + ' slots</span>' +
        '<span class="chip">' + esc(state.config.timezone || "") + '</span>' +
        (state.world ? '<span class="chip">' + state.world.nodes + ' places · ' + state.world.roads +
          ' roads · ' + state.world.fleet + ' vehicles</span>' : '');
    }

    const rooms = $("rooms");
    const bc = $("bc-room");
    const current = bc.value;
    if (!state.rooms.length) {
      rooms.innerHTML = '<div class="empty">No rooms open. The fire is unlit.</div>';
    } else {
      rooms.innerHTML = state.rooms.map((room) =>
        '<div class="room"><div class="room-head"><strong>' + esc(room.name) + '</strong>' +
        '<span class="code">' + esc(room.code) + '</span>' +
        '<span class="chip">' + esc(room.theme) + '</span>' +
        '<span class="chip">' + room.players.length + " seated</span>" +
        (room.locked ? '<span class="chip">locked</span>' : "") +
        '<span class="chip">' + room.messages + " lines</span>" +
        '<button class="ghost" style="margin-left:auto" data-bc="' + esc(room.code) + '">Announce</button>' +
        "</div>" +
        (room.players.length
          ? '<table><thead><tr><th>Wanderer</th><th>Connection</th><th></th></tr></thead><tbody>' +
            room.players.map((p) => playerRow(room.code, p)).join("") + "</tbody></table>"
          : '<div class="empty">Empty — reclaimed after 30 minutes idle.</div>') +
        "</div>").join("");
    }
    bc.innerHTML = '<option value="">All rooms</option>' +
      state.rooms.map((r) => '<option value="' + esc(r.code) + '">' + esc(r.name) + " (" + esc(r.code) + ")</option>").join("");
    bc.value = current;

    $("bans").innerHTML = state.bans.length
      ? '<table><thead><tr><th>Who</th><th>Why</th><th></th></tr></thead><tbody>' +
        state.bans.slice().reverse().map((b) =>
          "<tr><td><strong>" + esc(b.name || b.clientId || b.ip) + '</strong><div class="muted" style="font-size:11px">' +
          esc(b.whenText || "") + " · " + esc(b.ip || "") + "</div></td>" +
          '<td class="muted" style="font-size:11.5px">' + esc(b.reason || "") + "</td>" +
          '<td style="text-align:right"><button class="ghost" data-unban="' + esc(b.id) + '">Lift</button></td></tr>').join("") +
        "</tbody></table>"
      : '<div class="empty">Nobody is barred. Keep it that way.</div>';

    $("log").innerHTML = state.log.length
      ? state.log.map((e) => '<div><time>' + esc(e.time) + '</time><span class="k-' + esc(e.kind) + '">' +
          esc(e.text) + (e.detail ? ' <span class="muted">· ' + esc(e.detail) + "</span>" : "") + "</span></div>").join("")
      : '<div class="empty">No events yet.</div>';
  }

  async function poll() {
    if (!key) { setStatus("locked"); showGate(); return; }
    try {
      const data = await api("/api/admin/state");
      hideGate();
      render(data);
    } catch (error) {
      setStatus("not authorised");
      if (!sessionStorage.getItem(sessionKey)) {
        showGate(error.message);
      }
      $("authMsg").innerHTML = '<div class="warnbox">' + esc(error.message) + "</div>";
    }
  }

  document.addEventListener("click", (event) => {
    const t = event.target.closest("button");
    if (!t) return;
    if (t.dataset.kick) act({ action: "kick", room: t.dataset.room, playerId: t.dataset.kick, reason: "host decision" });
    if (t.dataset.ban) {
      const reason = prompt("Reason for barring " + t.dataset.name + "?", "host decision");
      if (reason !== null) act({ action: "ban", room: t.dataset.room, playerId: t.dataset.ban, reason: reason });
    }
    if (t.dataset.unban) act({ action: "unban", banId: t.dataset.unban });
    if (t.dataset.bc) { $("bc-room").value = t.dataset.bc; $("bc-text").focus(); }
  });

  $("save-key").addEventListener("click", () => {
    key = $("key").value.trim();
    localStorage.setItem("aether.admin.key", key);
    poll();
  });
  $("key").addEventListener("keydown", (e) => { if (e.key === "Enter") $("save-key").click(); });
  $("refresh").addEventListener("click", poll);
  $("clear-log").addEventListener("click", () => act({ action: "clearLog" }));
  $("bc-send").addEventListener("click", () => {
    const text = $("bc-text").value.trim();
    if (!text) return;
    act({ action: "broadcast", text: text, room: $("bc-room").value });
    $("bc-text").value = "";
  });
  $("bc-text").addEventListener("keydown", (e) => { if (e.key === "Enter") $("bc-send").click(); });
  $("filter-apply").addEventListener("click", () => act({ action: "filter", mode: $("filter-mode").value }));

  poll();
  setInterval(poll, 2500);
})();
</script>
</body>
</html>
"""


# --------------------------------------------------------------------------- #
# Host console
# --------------------------------------------------------------------------- #
CONSOLE_HELP = """
  Commands
    rooms                     list rooms and players
    list [CODE]               detailed view of one room
    say [CODE] <text>         broadcast as the wardens (omit CODE for all)
    kick <name|id> [reason]   remove a player
    ban <name|id> [reason]    remove and bar the player (client, name and IP)
    unban <name|id|banId>     lift a ban
    bans                      show the ban list
    filter <ban|log|off>      profanity handling
    panel                     print the admin panel address
    clear                     clear the console/event screen
    stop                      close the realm
"""


def console_list(room: Room) -> None:
    with room.lock:
        print(f"\n  {room.name}  [{room.code}]  theme={room.theme}  "
              f"{len(room.players)}/{room.max_players}{'  locked' if room.password else ''}")
        if not room.players:
            print("    (empty)")
        for player in room.players.values():
            idle = int(time.time() - player.last_seen)
            flags = []
            if player.weapon:
                flags.append(f"{player.weapon} drawn")
            if player.fear_state()["active"]:
                flags.append("afraid")
            if player.strikes:
                flags.append(f"{player.strikes} strikes")
            print(f"    · {player.name:<20} {player.cls:<9} {player.ip:<15} "
                  f"idle {idle:>2}s  {' '.join(flags)}")


def console_panel(httpd: ThreadingHTTPServer) -> None:
    global FILTER_MODE, ADMIN_PASSWORD
    if not sys.stdin or not sys.stdin.isatty():
        return
    while True:
        try:
            raw = input("  aether> ")
        except (EOFError, KeyboardInterrupt):
            return
        except Exception:
            return
        line = raw.strip()
        if not line:
            continue
        parts = line.split(" ", 1)
        verb = parts[0].lower()
        rest = parts[1].strip() if len(parts) > 1 else ""

        if verb in ("help", "?", "h"):
            print(CONSOLE_HELP)
        elif verb == "rooms":
            with ROOMS_LOCK:
                rooms = list(ROOMS.values())
            if not rooms:
                print("  No rooms open.")
            for room in rooms:
                info = room.info()
                print(f"  {info['code']}  {info['name']:<26} {info['players']}/{info['maxPlayers']} "
                      f"{'locked ' if info['locked'] else ''}{info['theme']}")
            print(f"  Bans: {len(BANS)} · filter: {FILTER_MODE}")
        elif verb == "list":
            with ROOMS_LOCK:
                rooms = [ROOMS[rest.upper()]] if rest.upper() in ROOMS else list(ROOMS.values())
            if not rooms:
                print("  No rooms open.")
            for room in rooms:
                console_list(room)
        elif verb in ("say", "broadcast"):
            code = ""
            text = rest
            if rest[:4].upper() in ROOMS and len(rest) > 4 and rest[4] == " ":
                code, text = rest[:4].upper(), rest[5:]
            if not text:
                print("  say <text>  or  say ABCD <text>")
                continue
            with ROOMS_LOCK:
                rooms = [ROOMS[code]] if code in ROOMS else list(ROOMS.values())
            for room in rooms:
                room.broadcast({"kind": "system", "from": None, "text": f"[Wardens] {text}"})
            log_event("admin", f"Console announcement to {len(rooms)} room(s)", text[:80])
            print(f"  Sent to {len(rooms)} room(s).")
        elif verb == "kick":
            target = rest.split(" ")[0]
            reason = rest[len(target):].strip() or "host decision"
            room, player = find_player_global(target if len(target) == 10 else "", target)
            if not player:
                print(f"  No player matching '{target}'.")
                continue
            room.remove_player(player.id, reason="kick")
            log_event("kick", f"Kicked {player.name} from {room.code}", reason)
        elif verb == "ban":
            target = rest.split(" ")[0]
            reason = rest[len(target):].strip() or "host decision"
            room, player = find_player_global(target if len(target) == 10 else "", target)
            if not player:
                print(f"  No player matching '{target}'.")
                continue
            issue_ban(room, player, reason, by="console")
        elif verb == "unban":
            target = rest
            removed = False
            with BANS_LOCK:
                matches = [b for b in BANS if target.casefold() in (
                    str(b.get("id", "")), str(b.get("name", "")).casefold(), str(b.get("ip", "")))]
            for entry in matches:
                removed = remove_ban(entry.get("id")) or removed
            print("  Ban lifted." if removed else f"  No ban matching '{target}'.")
            if removed:
                log_event("admin", f"Ban lifted for {target}")
        elif verb == "bans":
            with BANS_LOCK:
                entries = list(BANS)
            if not entries:
                print("  Nobody is barred.")
            for entry in entries:
                print(f"  {entry.get('id')}  {entry.get('name'):<20} {entry.get('ip'):<15} "
                      f"{entry.get('whenText')}  {entry.get('reason')}")
        elif verb == "filter":
            if rest not in ("ban", "log", "off"):
                print("  filter ban | log | off")
                continue
            FILTER_MODE = rest
            log_event("admin", f"Filter set to {rest}")
            print(f"  Profanity filter: {rest}")
        elif verb == "fleet":
            with DB_LOCK:
                fleets = list(FLEET.values())
            if not fleets:
                print("  No vehicles saved yet.")
            for fleet in fleets:
                node = _find_node(fleet) or {}
                model = VEHICLES.get(fleet.get("vehicle"), {}).get("name", fleet.get("vehicle"))
                print(f"  {fleet['clientId'][:12]:<12} {model:<22} at {node.get('name', '?'):<18} "
                      f"fuel {fleet.get('fuel', 0):<5.0f} L  {fleet_range_km(fleet):>6.0f} km  "
                      f"load {fleet_cargo_kg(fleet):>6.0f} kg  cash {fleet.get('cash', 0):.0f}")
        elif verb == "world":
            world = WORLD.get(SERVER_CONFIG["region"], {})
            print(f"  {world.get('name')} · {len(world.get('nodes', []))} places · "
                  f"{len(world.get('roads', []))} roads · {len(world.get('vehicles', []))} models")
            for node in world.get("nodes", []):
                print(f"    {node['id']:<12} {node['name']:<20} {node['kind']:<11} "
                      f"{node['climate']:<12} {', '.join(node['services'])}")
        elif verb == "config":
            print(f"  Region    : {SERVER_CONFIG['region']} ({REGIONS[SERVER_CONFIG['region']]['name']})")
            print(f"  Name      : {SERVER_CONFIG['name']}")
            print(f"  Language  : {SERVER_CONFIG['language']}")
            print(f"  Slots     : {SERVER_CONFIG['slots']}")
            print(f"  Modules   : {', '.join(SERVER_CONFIG['modules'])}")
            print(f"  Database  : {DB_PATH}")
            print(f"  Panel     : http://127.0.0.1:{httpd.server_address[1]}/admin")
            print(f"  Password  : {ADMIN_PASSWORD}")
        elif verb == "password":
            ADMIN_PASSWORD = rest or secrets.token_urlsafe(9)
            ADMIN_SESSIONS.clear()
            log_event("admin", "Warden password rotated")
            print(f"  New panel password: {ADMIN_PASSWORD}")
        elif verb == "panel":
            port = httpd.server_address[1]
            print(f"  http://127.0.0.1:{port}/admin  (password: {ADMIN_PASSWORD})")
        elif verb == "clear":
            with EVENTS_LOCK:
                EVENTS.clear()
            print("\033[2J\033[H", end="")
        elif verb in ("stop", "quit", "exit"):
            print("  Closing the realm. Farewell.")
            httpd.shutdown()
            os._exit(0)
        else:
            print(f"  Unknown command '{verb}'. Type help.")


# --------------------------------------------------------------------------- #
# Entry points
# --------------------------------------------------------------------------- #
def local_addresses() -> list[str]:
    addresses = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        addresses.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    return sorted(a for a in addresses if not a.startswith("127."))


def start_http_server(bind: str, port: int, label: str) -> ThreadingHTTPServer:
    try:
        httpd = ThreadingHTTPServer((bind, port), Handler)
    except OSError as exc:
        print(f"  ! Could not bind {bind}:{port} — {exc}", file=sys.stderr)
        raise SystemExit(1)
    httpd.daemon_threads = True
    thread = threading.Thread(target=httpd.serve_forever, name=f"{label}-server", daemon=True)
    thread.start()
    return httpd


def _ask(prompt: str, default: str = "") -> str:
    label = f"{prompt} [{default}]: " if default else f"{prompt}: "
    try:
        raw = input(label)
    except (EOFError, KeyboardInterrupt):
        print("")
        return ""
    return raw.strip() or default


def _pick(prompt: str, options: list[tuple[str, str]], default: int, lang: str) -> str:
    print(f"  {prompt}  ({t('default_hint', lang)}: {default})")
    for index, (key, label) in enumerate(options, start=1):
        print(f"    {index}. {label}")
    while True:
        raw = _ask(f"  {t('choose', lang)}", str(default))
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return options[int(raw) - 1][0]
        if raw in {key for key, _ in options}:
            return raw
        print(f"  ! {t('invalid', lang)}")


def setup_wizard(args) -> dict | None:
    """Interactive host setup: language, region, name, slots, modules, database."""
    region_keys = list(REGIONS)
    if args.no_wizard or not sys.stdin or not sys.stdin.isatty():
        region = args.region if args.region in REGIONS else "turkey"
        return {
            "language": args.language or REGIONS[region]["language"],
            "region": region,
            "name": args.name or REGIONS[region]["defaultName"],
            "slots": args.slots,
            "modules": [m.strip() for m in (args.modules or "vehicles,logistics,world").split(",") if m.strip()],
            "db": args.db or os.environ.get("AETHERHOLD_DB") or os.path.join(BASE_DIR, "aetherhold.db"),
        }

    print("")
    print("  ==========================================================")
    print(f"   {APP_NAME} {VERSION} — {t('banner', 'en')}")
    print("  ==========================================================")
    print("")
    language = _pick(t("language", "en"), [(key, spec["native"]) for key, spec in LANGUAGES.items()],
                     1 if (args.language or "en") == "en" else 2, "en")
    print(f"  ✓ {t('language_set', language)}")
    print("")
    region = _pick(t("region", language),
                   [(key, f"{REGIONS[key]['name']} — {REGIONS[key]['defaultName']}") for key in region_keys],
                   region_keys.index(args.region) + 1 if args.region in region_keys else 1, language)
    print("")
    print(f"  {REGIONS[region]['blurb']}")
    print("")
    name = _ask(f"  {t('name', language)}", REGIONS[region]["defaultName"])
    slots = args.slots
    while True:
        raw = _ask(f"  {t('slots', language)} ({t('slots_hint', language)})", str(slots))
        try:
            slots = max(2, min(MAX_PLAYERS_LIMIT, int(raw)))
            break
        except ValueError:
            print(f"  ! {t('invalid', language)}")
    modules = _ask(f"  {t('modules', language)}", args.modules or "vehicles,logistics,world")
    print(f"  → {', '.join(m.strip() for m in modules.split(',') if m.strip())}")
    db = _ask(f"  {t('database', language)} — {t('db_hint', language)}",
              args.db or os.path.join(BASE_DIR, "aetherhold.db"))
    print("")

    world = build_world(region)
    print("  ┌──────────────────────────────────────────────────────┐")
    print(f"  │ {t('dashboard', language).upper():<52} │")
    print("  ├──────────────────────────────────────────────────────┤")
    rows = [
        (t("region", language), f"{REGIONS[region]['name']} · {REGIONS[region]['timezone']} (UTC{REGIONS[region]['utc']:+d})"),
        (t("name", language), name),
        ("Language", LANGUAGES[language]["native"]),
        (t("slots", language), str(slots)),
        (t("modules", language), modules),
        (t("database", language), os.path.basename(db)),
        ("World", f"{len(world['nodes'])} places · {len(world['roads'])} roads"),
        ("Fleet", f"{len(world['vehicles'])} models · {REGIONS[region]['currency']} {REGIONS[region]['fuelPrice']}/L"),
    ]
    for label, value in rows:
        line = f"{label:<14}: {value}"
        print(f"  │ {line[:52]:<52} │")
    print("  └──────────────────────────────────────────────────────┘")
    print("")
    answer = _ask(f"  {t('confirm', language)}", "Y").casefold()
    if answer not in ("y", "yes", "e", "evet", "1", "true"):
        print(f"  {t('cancelled', language)}")
        return None
    return {
        "language": language,
        "region": region,
        "name": name,
        "slots": slots,
        "modules": [m.strip() for m in modules.split(",") if m.strip()],
        "db": db,
    }


def print_host_dashboard(config: dict, base: str, admin_password: str) -> None:
    lang = config["language"]
    region = REGIONS[config["region"]]
    world = WORLD[config["region"]]
    print("")
    print("  ==========================================================")
    print(f"   {APP_NAME} {VERSION} — {config['name']}")
    print("  ==========================================================")
    print(f"   {t('region', lang):<10}: {region['name']} · {region['timezone']} (UTC{region['utc']:+d})")
    print(f"   Language  : {LANGUAGES[lang]['native']} · {config['slots']} slots · {'/'.join(config['modules'])}")
    print(f"   World     : {len(world['nodes'])} places, {len(world['roads'])} roads, "
          f"{len(world['vehicles'])} vehicle models")
    print(f"   Database  : {DB_PATH} ({len(FLEET)} fleets in memory)")
    print(f"   Local     : {base}")
    for address in local_addresses():
        print(f"   Network   : http://{address}:{base.rsplit(':', 1)[-1]}")
    print(f"   Panel     : {base}/admin")
    print(f"   Password  : {admin_password}")
    print(f"   Admin key : {ADMIN_KEY}")
    print("")
    print("   Share a Network address with your friends, or have them run:")
    print(f"     python server.py --connect {base}")
    print("   Console: help · fleet · world · config · panel · stop")
    print("")


def run_host(args) -> None:
    global ADMIN_KEY, ADMIN_PASSWORD, BANS_FILE, FILTER_MODE, SERVER_CONFIG
    config = setup_wizard(args)
    if config is None:
        return
    SERVER_CONFIG.update(config)
    BANS_FILE = os.path.abspath(args.bans_file or DEFAULT_BANS_FILE)
    FILTER_MODE = args.filter
    load_bans()
    ADMIN_KEY = args.admin_key or secrets.token_urlsafe(12)
    ADMIN_PASSWORD = args.admin_password or secrets.token_urlsafe(9)

    # The database, the road graph and the fleet are loaded into memory before
    # a single socket answers, per the setup contract.
    print(f"  {t('starting', config['language'])}")
    load_world_data()
    init_db(config["db"])
    print("  Loading mods…")
    load_mods()
    if not MODS:
        print("  (no mods installed — drop a .py file into ./mods)")

    threading.Thread(target=reap_loop, name="reaper", daemon=True).start()
    httpd = start_http_server(args.host, args.port, "aetherhold")
    actual_port = httpd.server_address[1]
    base = f"http://127.0.0.1:{actual_port}"

    room_name = args.room or config["name"]
    room = Room(sanitize_name(room_name, REGIONS[config["region"]]["defaultName"]),
                min(MAX_PLAYERS_LIMIT, max(2, args.max_players)),
                args.password or "", args.theme)
    ROOMS[room.code] = room

    print_host_dashboard(config, base, ADMIN_PASSWORD)
    print(f"   Hall      : {room.name} (code {room.code})")
    print(f"   Bans      : {len(BANS)} loaded · filter: {FILTER_MODE}")
    print("")

    if not args.no_browser:
        try:
            webbrowser.open(base)
        except Exception:
            pass
    if not args.no_console:
        threading.Thread(target=console_panel, args=(httpd,), name="console", daemon=True).start()
    start_mod_ticker()
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n  Closing the realm. Farewell.")
        httpd.shutdown()


def run_connect(args) -> None:
    target = args.connect.strip().rstrip("/")
    if not re.match(r"^https?://", target):
        target = "http://" + target

    httpd = start_http_server("127.0.0.1", args.port if args.port != 8080 else 0, "launcher")
    port = httpd.server_address[1]
    url = f"http://127.0.0.1:{port}/?server={target}"
    print("")
    print("  ==========================================================")
    print(f"   {APP_NAME} {VERSION} - connecting to a hosted realm")
    print("  ==========================================================")
    print(f"   Host      : {target}")
    print(f"   Launcher  : http://127.0.0.1:{port}")
    print("")
    print("   The game is served locally and points at the host above.")
    print("   Press Ctrl+C to disconnect.")
    print("")
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n  Disconnected. Farewell.")
        httpd.shutdown()


def main(argv=None) -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(
        prog="server.py",
        description="Aetherhold — host or connect to a 3D chat & roleplay realm.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python server.py\n"
            "  python server.py --no-wizard --region turkey --language tr --name \"Anadolu Hattı\"\n"
            "  python server.py --no-wizard --region america --language en --port 9000\n"
            "  python server.py --connect http://192.168.1.20:8080\n"
            "\nconsole commands: rooms, list, say, kick, ban, unban, bans, filter, fleet, world,\n"
            "                  config, password, panel, stop\n"
        ),
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--connect", metavar="URL",
                      help="connect to a running host instead of hosting")
    parser.add_argument("--host", default="0.0.0.0",
                        help="address to bind when hosting (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=None,
                        help="port to listen on (default: $PORT or 8080; 0 picks a free port)")
    parser.add_argument("--room", default="", help="create a pre-made room with this name")
    parser.add_argument("--theme", default="ember", choices=sorted(THEMES),
                        help="world theme for the pre-made room")
    parser.add_argument("--max-players", type=int, default=8,
                        help="player cap for the pre-made room (default: 8)")
    parser.add_argument("--password", default="", help="password for the pre-made room")
    parser.add_argument("--admin-key", default=os.environ.get("AETHERHOLD_ADMIN_KEY", ""),
                        help="key for /admin and the control API (random if omitted)")
    parser.add_argument("--admin-password", default=os.environ.get("AETHERHOLD_ADMIN_PASSWORD", ""),
                        help="password the warden's panel asks for (random if omitted)")
    parser.add_argument("--language", default="", choices=("", "en", "tr"),
                        help="server language: en or tr (wizard asks if omitted)")
    parser.add_argument("--region", default="turkey", choices=sorted(REGIONS),
                        help="region and theme catalog (default: turkey)")
    parser.add_argument("--name", default="", help="server name (region default if omitted)")
    parser.add_argument("--slots", type=int, default=12,
                        help="player capacity for the whole server (default: 12)")
    parser.add_argument("--modules", default="vehicles,logistics,world",
                        help="active modules, comma separated")
    parser.add_argument("--db", default=None,
                        help="SQLite database for fleet, cargo and discoveries "
                             "(default: $AETHERHOLD_DB or ./aetherhold.db)")
    parser.add_argument("--no-wizard", action="store_true",
                        help="skip the interactive setup wizard and use flags/defaults")
    parser.add_argument("--bans-file", default=DEFAULT_BANS_FILE,
                        help="where the ban list is stored (default: bans.json)")
    parser.add_argument("--filter", default="ban", choices=("ban", "log", "off"),
                        help="profanity handling: ban automatically, log only, or off")
    parser.add_argument("--no-console", action="store_true", help="do not listen for console commands")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    args = parser.parse_args(argv)

    if not os.path.isdir(PUBLIC_DIR):
        print(f"  ! Missing client folder: {PUBLIC_DIR}", file=sys.stderr)
        raise SystemExit(1)

    if args.port is None:
        args.port = int(os.environ.get("PORT", "8080"))
    if args.db is None:
        args.db = os.environ.get("AETHERHOLD_DB") or os.path.join(BASE_DIR, "aetherhold.db")

    if args.connect:
        run_connect(args)
    else:
        run_host(args)


if __name__ == "__main__":
    main()
