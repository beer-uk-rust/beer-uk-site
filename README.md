# Beer-UK website — setup

Everything in this folder is a ready-to-deploy static site: `index.html`, `rules.html`, `apply.html`, `style.css`, `main.js`, and `images/`. No build step, no coding needed to publish it or update it later.

## Before it goes live

Open `rules.html` and fill in the two `[Fill in: ...]` placeholders (building/decay rules and raiding rules), and delete the dashed "Draft" notice box once you have. Also swap the placeholder Just-Wiped and rust-servers.net links in the footer (`index.html`, `rules.html`, `apply.html`) for your actual listing URLs.

## Step 1 — put it on Netlify (free)

1. Go to **app.netlify.com** and sign up (free — email or GitHub login).
2. Once logged in, look for **"Deploys"** or the drag-and-drop box on the dashboard ("Want to deploy a new site without connecting to Git? Drag and drop your site output folder here").
3. Drag the whole `beer-uk-site` folder onto it. Netlify uploads it and gives you a live URL immediately, something like `random-name-123.netlify.app`. That's already a working, live website — worth checking it over before moving to your own domain.
4. The apply/contact form works automatically once deployed on Netlify — no setup needed. Submissions show up under **Site settings → Forms** in your Netlify dashboard.

## Step 2 — register beer-uk.co.uk

1. Go to a UK registrar — **Namecheap** or **123-reg** are both fine — and search `beer-uk.co.uk`.
2. Register it (roughly £8-12/year). You'll need to create an account and pay with a card.

## Step 3 — point the domain at Netlify

1. Back in Netlify: open your site → **Domain settings** → **Add a domain** → type `beer-uk.co.uk`.
2. Netlify will show you either nameservers to set, or a couple of DNS records (usually an A record and a CNAME) to add.
3. Go back to your registrar, find **DNS settings** (sometimes called "Manage DNS" or "Nameservers") for the domain, and enter what Netlify showed you.
4. DNS changes can take anywhere from a few minutes to a few hours to take effect. Netlify's domain settings page will show a green check once it's live and will also auto-provision free HTTPS for you.

## Updating the site later

Edit the HTML/CSS files, then drag the folder onto Netlify again (or onto the existing site's "Deploys" tab) — it replaces the live version in seconds, no domain or DNS steps needed again.
