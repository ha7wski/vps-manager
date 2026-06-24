# Guide d'utilisation

Comment lancer **VPS Manager** après avoir cloné le projet. Ce guide s'adresse
à un utilisateur qui part de zéro : il couvre l'installation, le démarrage, la
connexion à un VPS et l'arrêt de l'application.

> VPS Manager est une application de bureau **macOS** qui gère un serveur Ubuntu
> distant en SSH/SFTP : fichiers, terminal interactif, métriques système et logs
> en direct.

---

## 1. Prérequis

Avant de commencer, assure-toi d'avoir :

| Outil | Version | Vérifier avec |
|-------|---------|---------------|
| **macOS** | Apple Silicon (arm64) recommandé | — |
| **Git** | n'importe quelle version récente | `git --version` |
| **Node.js** | 18 ou plus (testé sur 20) | `node -v` |
| **Python** | 3.11 à 3.13 | `python3 --version` |

Si Node ou Python manquent, le plus simple est [Homebrew](https://brew.sh) :

```bash
brew install node python git
```

Tu auras aussi besoin des **identifiants SSH** de ton VPS : adresse (IP ou nom
d'hôte), port (22 par défaut), nom d'utilisateur et **mot de passe**.

> ℹ️ L'authentification se fait **par mot de passe** uniquement. La connexion par
> clé SSH n'est pas encore prise en charge.

---

## 2. Cloner le projet

```bash
git clone https://github.com/ha7wski/vps-manager.git
cd vps-manager
```

---

## 3. Lancer l'application (méthode recommandée)

Une seule commande démarre tout — le backend, le serveur de développement et la
fenêtre de l'application :

```bash
./local-dev/start.sh
```

**Au premier lancement**, le script installe automatiquement toutes les
dépendances :
- crée l'environnement Python (`backend/.venv`) et installe les paquets,
- installe les dépendances npm du frontend et d'Electron.

C'est un peu long la première fois (quelques minutes), puis quasi instantané
ensuite. Les ports sont choisis automatiquement : si le port par défaut est déjà
pris par un autre projet, le suivant libre est utilisé — **aucun process
existant n'est tué**.

Quand tout est prêt, la fenêtre de l'application s'ouvre et le terminal affiche :

```
All processes started. Close the app window or press Ctrl+C to stop.
```

### Variantes utiles

```bash
./local-dev/start.sh --no-electron     # backend + frontend seuls (test dans un navigateur)
./local-dev/start.sh --backend-only    # backend seul
BACKEND_PORT=9000 ./local-dev/start.sh # forcer le port de départ du backend
RELOAD=1 ./local-dev/start.sh          # recharger le backend à chaque modif (dev)
VPS_DEVTOOLS=1 ./local-dev/start.sh    # ouvrir les DevTools d'Electron au lancement
```

---

## 4. Se connecter à un VPS

À l'ouverture, l'écran de connexion demande quatre champs :

| Champ | Exemple | Remarque |
|-------|---------|----------|
| **Host** | `203.0.113.10` | IP ou nom d'hôte du serveur |
| **Port** | `22` | port SSH (22 par défaut) |
| **Username** | `ubuntu` | utilisateur SSH |
| **Password** | `••••••••` | gardé en mémoire seulement, jamais écrit sur disque |

Clique sur **Connect**. En cas d'échec, le message est explicite :
- mauvais identifiants → erreur d'authentification,
- serveur injoignable → erreur de connexion.

Une fois connecté, l'explorateur de fichiers s'ouvre **directement sur le dossier
personnel** de l'utilisateur SSH (résolu automatiquement côté serveur). La barre
latérale donne accès aux autres modules : Terminal, Dashboard (métriques) et
Logs.

---

## 5. Arrêter l'application

Deux façons, équivalentes — les deux arrêtent **tout** (application + backend) :

- **Fermer la fenêtre** de l'application, ou
- revenir au terminal et faire **Ctrl+C**.

Le terminal affiche alors `Shutting down...` et rend la main. Il n'y a pas de
process résiduel à tuer manuellement.

---

## 6. (Optionnel) Construire l'application packagée (.dmg)

Pour produire un `.dmg` installable au lieu de lancer en mode développement :

```bash
cd electron && npm install
npm run dist
```

Le résultat se trouve dans `electron/dist-electron/` :

```
dist-electron/
├── VPS Manager-<version>-arm64.dmg     installateur
└── mac-arm64/VPS Manager.app           application autonome
```

Lancer l'app construite :

```bash
open "electron/dist-electron/mac-arm64/VPS Manager.app"
```

> ⚠️ **Build non signé** et **arm64 uniquement.** Sans certificat *Developer ID*,
> macOS Gatekeeper peut mettre l'app en quarantaine si tu la déplaces ailleurs ;
> le cas échéant : `xattr -dr com.apple.quarantine "<chemin de l'app>"`.

---

## 7. Dépannage

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| `permission denied` sur `start.sh` | script non exécutable | `chmod +x local-dev/start.sh` |
| `python3: command not found` | Python absent | `brew install python` |
| `node: command not found` | Node absent | `brew install node` |
| Échec de connexion alors que SSH marche dans le terminal | mauvais host/port/identifiants, ou pare-feu | vérifie les champs ; teste `ssh user@host` à côté |
| Installation des dépendances figée | venv ou `node_modules` à moitié installés | supprime `backend/.venv`, `frontend/node_modules`, `electron/node_modules` puis relance `start.sh` |
| Logs système (`/var/log/syslog`, `auth.log`) vides | droits root requis | l'utilisateur SSH doit être dans le groupe `adm`/`syslog` |

---

Pour aller plus loin : voir [`README.md`](README.md) (architecture, API,
structure du projet), [`FEATURES.md`](FEATURES.md) (liste des fonctionnalités)
et [`PROGRESS.md`](PROGRESS.md) (état technique et feuille de route).
