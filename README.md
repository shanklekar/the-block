# OPENLANE MARKETPLACE

## How to Run

Use the repository root for all commands below. This app has a React/Vite frontend, a FastAPI backend, and a SQLite database at `data/vehicles.sqlite`.

If you want the repo to handle setup and local startup for you, use the automated helper:

```bash
./dev.sh setup
./dev.sh start
```

Or run everything in one step:

```bash
./dev.sh all
```

### 1. Prerequisites

Make sure these are installed locally:

- `python3`
- `pip`
- `npm`

It is easiest to use two terminal tabs or windows while developing: one for the backend and one for the frontend.

### 2. Clone the repo

```bash
git clone <repo-url>
cd block
```

### 3. Create and activate a Python virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

If you are on Windows, use the equivalent activation command for your shell.

### 4. Install backend dependencies

```bash
python3 -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 5. Populate the SQLite database

These scripts rebuild the application tables inside `data/vehicles.sqlite`. Run them from the repo root in this order:

```bash
python testing_scripts/load_data/vehicles.py
python testing_scripts/load_data/users.py
python testing_scripts/load_data/watching.py
python testing_scripts/load_data/purchased.py
python testing_scripts/load_data/bids.py
```

Rerunning these scripts resets the seeded data for the tables they recreate.

### 6. Install frontend dependencies

```bash
npm install
```

### 7. Start the backend API

```bash
uvicorn backend.app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

Useful sanity checks:

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

### 8. Start the frontend UI

Open a second terminal in the repo root. You only need to activate the virtual environment there if you plan to run Python commands in that terminal.

```bash
npm run dev
```

Vite prints the exact local URL when it starts, typically `http://127.0.0.1:5173/` or `http://localhost:5173/`.

### 9. Open the app in a browser

Visit the frontend URL shown by Vite in your browser.

The frontend talks to the backend at `http://127.0.0.1:8000` by default, so no extra environment configuration is required for standard local development.

### 10. Practical notes

- If port `8000` or `5173` is already in use, stop the conflicting process or start the service on a different port.
- If the frontend cannot reach the backend, confirm the FastAPI server is still running first.
- The frontend supports `VITE_API_BASE_URL` if you need to point it at a different backend, and it defaults to `http://127.0.0.1:8000`.
- After setup, run `npm run build` from the repo root to verify the frontend builds successfully.


## Time Spent

Roughly how much time you spent and how you approached the time box?

I started work saturday morning and ended saturday evening.  Interruptions from kids and wife made it difficult to say how much time I actually spent.  I would write a prompt, let codex run with it, and then come back and test the output.  

Majority of time was spent thinking about how I wanted to phrase my prompts, physically typing them, and how I wanted to approach the bidding implementation.  Other than a little debugging around the bidding process and trying to get UI to look right the AI basically one shot everything.

I gave myself a one day time box knowing I wasn't going to have dedicated time to work on it.  I wanted a complete working prototype to demo rather than something ugly, mocked up, and poorly implemented.  I have a hard time halfway doing things unless there is a real time restriction, in which case I identify the root issue to be solved and just tackle that directly.  

And this kind of thing is just a lot of fun so I wanted to work on it.  You said I could spend more than 3-4 hours so I did.  I added some extra features that would not be considered mvp but really improves the experience.  

If I was forced to abide by the 3-4 hour time box and minimum requirements I would have just built a mock up front end app, no backend or database at all, that just illustrated the concept of how the user could filter for vehicles, show their details, and place bids in memory (no way for anyone to bid against them).  It would not have included the watchlist concept, bidding would have been one vehicle at a time in the details modal, and there would have been no safety toggle for bidding.  The Live search UI (minus live bid component), filtering, and vehicle details would have looked pretty much the same.  If I was running good on time I would probably have tried to improve the look of the UI some, better colors, just extra polish.

## Assumptions and Scope

What you intentionally included, skipped, or simplified?

Included
- Everything described for the minimum bar

Skipped
- I did not build a dedicated mobile app but the web app is responsive and should be usable on a phone.
    - I chose this route because it covered all use cases, vs a dedicated mobile app would only cover mobile devices (if I went cross platform) or a single platform if I went native.
    - I also do not have mobile development environment setup and that would take a while to setup and testing would take much longer
- Authentication - This was indicated as not being required so I started off not planning to implement it to save time and then forgot about it till the very end when I was wanting add multiple users for testing the bidding process.

Simplified
- User accounts are just a name and an ID to differentiate bidders for demo purposes
- Only built in the scope of individual users, nothing around dealerships with multiple users that you don't want to be able to bid against each other.
- There is no end to the auctions as there were no details provided as to whether they had set durations or if a live auctioneer would be dictating things like simulcast.  
    - I thought about just saying that every auction would last x number of minutes, but I wanted to be able to demo several features that would have been hard to time around this. 
        - Could have added config to manipulate time for the app but I had already spent enough time on it


## Stack

### Frontend
React + Vite
- Server side rendering would not allow for the desired experience
- I used react in the past so I had experience with it
- I knew it was more than capable of handling the requirements
- Lots of documentation out there for AI to be trained on
- Offers more flexibility than Angular (from my research many years ago)
- Used Vite because facebook and other sources recommended it and from quick research it sounded much better than create react app or building the stack myself

### Backend
Python Fast API
- Chose this for prototype/demo, would look at compiled languages for maximum speed for prd
- Scripted languages like python make development and testing much faster as there is no compile time
- I have greatest level of experience with python and its my most recent experience in data engineering
- Fast API is the fastest mainstream api framework for python and I find it the most straight forward to work with
Uvicorn
- The default webserver for fast api development
- Fast and easy to setup and use, perfect for prototyping/demo

For production, I would look at a .NET backend
- Compiled for speed
- Lots of local devs in corporate space have experience with it
- Lots of support and example code for AI to be trained on
- Its what we use internally

### Database
SQL Lite
- Chose for POC/demo because its by far the simplest to setup and use
- Met all the needs for the demo
- Requires no installation or setup for others to run on their machines

For production, I would look at Postgres
- A lot better for handling locking and high volumes of records with low latency
- Lots of people with experience working with it and information for AI to be trained on
- Its what Openlane uses internally

## What I Built

A brief description of your project and your approach.

I built a fully functioning prototype with a frontend, backend, and database.

The user can search for cars they want to bid on with as many filters as I could think to add.  The filters are designed in a way to make them as fast to use as possible since no one wants to waste their time.  The user is given the search results in the form of cards for each vehicle, showing a glimpse of what I assumed was the most relevant information to help them decide if they want to see more.  They can sort the vehicles by various filters that seem useful for different circumstances.

If the user clicks on a vehicle they get the detailed view modal where they can see all the available information about the car.  I tried to put most relevant information towards the top so scrolling is minimal.  I added a copy button for quickly getting the vin to paste into other systems to get more details.  I added a share button to get a url link to the vehicle to quickly share with others. If they click on pictures they get a full screen view and can cycle through all pictures for the car.

There is also a watchlist that users can add vehicles to.  Any vehicle a user bids on is automatically added to the watchlist.  The watchlist appears at the top of the main view so users can get to it quickly.  I kept it on same view so users don't have to click across different pages when they are trying to bid on cars and look for more cars to bid on at the same time.  The watchlist shares the live search component so code is reused, just with different api calls for what vehicles to display.  The watchlist also has a collapse button so users can focus on searching for more cars.

The vehicle cards inside the search results components are shared between watchlist and live search as well.  If they are displayed in live search, they wont show the live bidding component but will show the auction start time and (in Progress) state when auctions are live.

The live bidding component is active for vehicles where the auction has started.  By default, bidding is disabled via a toggle so users don't accidentally bid on something but I also wanted them to be able to single click quick bid when they are competing near the end of the auction.  If bidding is disabled and the user clicks the bid button it will switch the toggle to live bidding, but they need to click a second time to submit the bid. The bid amount defaults to current high bid plus 100.  The user can click one of the other quick bid amount options to use that value or manually type a value before clicking the bid now button to submit it.  The goal was to allow users to quickly place their bid amounts.  The number of bids is also displayed.

Live bidding uses websockets for low latency and live updates. Current high bid and bid count are both calculated based on bids in the database and update live.  To minimize web traffic, only vehicles in the watchlist or a vehicle your looking at in detailed view will show the live bidding information.

There is also a buy now button for vehicles that have a value for that.  They will see a yellow button on the vehicle and if they click it, they will get a confirmation prompt to make sure they want to buy it.  Any vehicle purchased with buy it now is added to the purchased vehicles page and will no longer show in live search or watchlist.

The purchased vehicles page just shows a list of the vehicles that were purchased, when, and for how much.  There is a search function so you can look up a specific vin or vehicle by make, model, etc...  The results update live as you search.  Moving vehicles here decluttered the search and watchlist.

There is also a user profile view, but all its used for it adding test users and switching between them.  This was used to test the live bidding process.

The backend database is treated as the source of truth and the api is built to handle sql and javascript injection.  It sanitizes the user provided input before adding to database.

## Notable Decisions

What choices did you make and why? What tradeoffs did you consider?

To minimize the number of websocket connections, only vehicles being watched or being looked at in detail view make a live bidding connection. I chose websockets over http requests because they allow much less latency and are better suited for real time feeds.

I described why I chose the stack above, and my UI decisions in the what I built section.

## Testing

What you tested and how?

For UI work I like to see it, play with it, and iterate on it.  This means the code changes a lot in feature development.  I like to get everything working like I want, manually testing it, then build automated testing, then have AI review the code, then review it myself.  I also keep the browser console open during testing to keep an eye out for errors there.

For this build I did manual testing as I worked through it, then wrote some key unit tests after everything was working to try and catch any bugs introduced with future changes.  This included a live api testing script to test competitive bidding scenarios.  I focused on the unit testing and api testing on the bidding process as this is the real core of the app and the main component that bugs can't be tolerated with.

For code review, I asked the AI what is wrong with the code, do you see sql or code injection vulnerabilities, what inefficiencies or other issues do you see.  It found some good stuff that I fixed and some stuff that was not important for this demo.

For manual testing, I clicked through the different UI components, trying them in every combination and on every view they are displayed.  I tested each filter to make sure it was filtering the results as expected, same with sorting.  I purchased vehicles with buy it now and made sure they went to purchases page with correct info.  I Loaded the ui in chrome and firefox to test different browsers and then bid against myself with both up side by side to make sure live bidding was working as expected.  I ran the front end with backend not running to make sure it handled no data like I expected.

Automated backend tests:

- In-process unit and API tests:

```bash
python3 -m unittest discover -s backend/tests -v
```

- Opt-in live API smoke tests against a running backend:

```bash
BLOCK_LIVE_API_SMOKE=1 python3 -m unittest backend.tests.test_live_smoke -v
```

The smoke tests default to `http://127.0.0.1:8000` and can be pointed elsewhere with `BLOCK_API_BASE_URL`.

Useful smoke-test environment variables:

- `BLOCK_API_BASE_URL`
- `BLOCK_API_TIMEOUT_SECONDS`
- `BLOCK_SMOKE_BIDDING_VEHICLE_ID`

The live smoke suite creates its own demo users, checks basic API health/search behavior, and runs a three-user rapid bidding scenario that verifies users cannot bid against themselves, cannot bid less than the required `$100` increment, and do not encounter unexpected HTTP failures during the sequence.

## What I'd Do With More Time

What would you add, improve, or change?

- I would polish the UI more
    - Use Openlane's official style guide and colors
    - Improve the filters
    - Improve UI when shrunk to mobile size, some of the buttons end up in awkward places
    - Reduce white space or offer a "condensed" mode so users can see more info at a time
    - Add a dark mode to reduce eye strain at night or in heavy use
- I would add authentication to demonstrate that
- I would add an auction ending process to illustrate how that would work
- I would have utilized docker and postgres
- I would have made the live bid component utilize the server time instead of local system time for when its displayed.  The backend will not let a user bid before the auction starts but the front end could if its in a different time configuration.
- I would have added a smart search for the live search and watchlist where the user can type a general description of what they are looking for and it would filter the search results based on that
- I would have added a news feed mode where vehicles we think the user would be most interested in are listed, based on their past search, bid, and buying history
- I would add prebid option so users can place an automated bid before the auction starts
- I would have added a bid history component to show the live bids on the vehicle
- Ability to hide vehicles I have no interest in from search results
- Ability to hide and rearrange information on the components (have dynamic components the user can customize)
- Fix the refresh flicker when the user bids on a vehicle (only update the components that changed)
- Allow user to customize the grid size in search results (see more cars on screen at a time or see larger pictures and fonts)
- I would add more unit tests, automated api tests, and automated gui tests (selenium/puppeteer)
- I would generate scripts to stress test the bidding process and see what it can handle
- I would have tested more
- I would fix the 
