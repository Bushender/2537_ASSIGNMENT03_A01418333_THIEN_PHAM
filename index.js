const DIFFICULTIES =
{
  easy:   { pairs: 3,  time: 15 },
  medium: { pairs: 6,  time: 30 },
  hard:   { pairs: 12, time: 60 },
};

let difficulty         = 'easy';
let running            = false;
let gameOver           = false;
let clicks             = 0;
let matched            = 0;
let totalPairs         = 0;
let timeLeft           = 0;
let timerId            = null;
let firstCard          = null;
let secondCard         = null;
let isChecking         = false;
let peeksLeft          = 1;
let consecutiveMatches = 0;
let peeking            = false;
let theme              = 'light';

const grid        = document.getElementById('game_grid');
const placeholder = document.getElementById('placeholder');
const timerVal    = document.getElementById('timerVal');
const clicksVal   = document.getElementById('clicksVal');
const matchedVal  = document.getElementById('matchedVal');
const leftVal     = document.getElementById('leftVal');
const totalVal    = document.getElementById('totalVal');
const peekBtn     = document.getElementById('peekBtn');
const themeBtn    = document.getElementById('themeBtn');

const resultModalEl = document.getElementById('resultModal');
const resultModal   = new bootstrap.Modal(resultModalEl);

themeBtn.addEventListener('click', () =>
{
  theme = theme === 'light' ? 'dark' : 'light';
  document.body.classList.toggle('dark');
  themeBtn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
});
document.querySelectorAll('.btn-difficulty').forEach(btn =>
{
  btn.addEventListener('click', () =>
  {
    document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
  });
});

document.getElementById('startBtn').addEventListener('click', () =>
{
  startGame();
});

document.getElementById('resetBtn').addEventListener('click', resetGame);

document.getElementById('modalPlayAgain').addEventListener('click', () =>
{
  resultModal.hide();
  startGame();
});

document.getElementById('modalExit').addEventListener('click', () =>
{
  resultModal.hide();
});

peekBtn.addEventListener('click', usePeek);

async function fetchRandomPokemon(count)
{
  // Fetch full Pokemon list
  const res  = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1500');
  const data = await res.json();

  // Shuffle and pick slightly more than needed
  const picked = data.results
    .sort(() => Math.random() - 0.5)
    .slice(0, count + 3);

  // Fetch details one by one and build the result list
  const pokemon = [];
  for (const p of picked)
  {
    const res    = await fetch(p.url);
    const detail = await res.json();

    // Get the official artwork image if it exists
    let img = null;
    if (detail.sprites && detail.sprites.other && detail.sprites.other['official-artwork'])
    {
      img = detail.sprites.other['official-artwork'].front_default;
    }

    if (img !== null)
    {
      pokemon.push({ name: detail.name, img: img });
    }

    // Stop once we have enough
    if (pokemon.length === count) break;
  }

  return pokemon;
}

async function startGame()
{
  resultModal.hide();
  clearGame();

  const cfg  = DIFFICULTIES[difficulty];
  totalPairs = cfg.pairs;
  timeLeft   = cfg.time;
  running    = true;
  gameOver   = false;
  peeksLeft  = 1;
  consecutiveMatches = 0;

  updateStatus();
  syncPeekBtn();

  showPlaceholder(`
    <div class="d-flex flex-column align-items-center gap-3 py-5">
      <div class="spinner-border" role="status" style="width:3rem;height:3rem;">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="placeholder-text">Fetching Pokemon...</p>
    </div>
  `);
  grid.style.display = 'none';

  try
  {
    const pokemon = await fetchRandomPokemon(cfg.pairs);
    if (pokemon.length < cfg.pairs) throw new Error('Not enough Pokemon with images');

    buildGrid(pokemon);
    placeholder.style.display = 'none';
    grid.style.display = 'grid';
    startTimer();
  }
  catch (err)
  {
    showPlaceholder(`
      <div class="text-center py-5">
        <p class="placeholder-text">Failed to load Pokemon.<br>Check your connection!</p>
      </div>
    `);
    running = false;
  }
}

function clearGame()
{
  clearInterval(timerId);
  clicks     = 0;
  matched    = 0;
  firstCard  = null;
  secondCard = null;
  isChecking = false;
  peeking    = false;
  running    = false;
  gameOver   = false;
  timerVal.className = 'stat-value';
  updateStatus();
}

function resetGame()
{
  clearGame();
  resultModal.hide();
  grid.style.display = 'none';
  grid.innerHTML     = '';
  showPlaceholder(`
    <p class="placeholder-text">Choose a difficulty and press Start!</p>
  `);
  timerVal.textContent = '--';
  leftVal.textContent  = '--';
  totalVal.textContent = '--';
  peekBtn.disabled     = true;
}

function showPlaceholder(html)
{
  placeholder.innerHTML     = html;
  placeholder.style.display = 'block';
}

function buildGrid(pokemon)
{
  grid.innerHTML = '';
  grid.className = difficulty;

  // Duplicate each Pokemon to make pairs then shuffle
  const cards = [...pokemon, ...pokemon]
    .sort(() => Math.random() - 0.5);

  cards.forEach(p =>
  {
    const wrap      = document.createElement('div');
    wrap.className  = 'card-wrap';

    const card        = document.createElement('div');
    card.className    = 'game-card';
    card.dataset.img  = p.img;
    card.dataset.name = p.name;
    card.innerHTML    = `
      <div class="card-inner">
        <div class="front_face">
          <img src="${p.img}" alt="${p.name}" loading="lazy">
        </div>
        <div class="back_face"></div>
      </div>
    `;

    const nameTag       = document.createElement('div');
    nameTag.className   = 'poke-name';
    nameTag.textContent = p.name;

    card.addEventListener('click', () => handleCardClick(card));

    wrap.appendChild(card);
    wrap.appendChild(nameTag);
    grid.appendChild(wrap);
  });
}

function handleCardClick(card)
{
  // game not running
  if (!running || gameOver) return;
  // peek animation in progress
  if (peeking) return;
  // card is already matched
  if (card.classList.contains('matched')) return;
  // card is already face up (prevents matching a card with itself)
  if (card.classList.contains('flip')) return;
  // a non-matching pair is animating back
  if (isChecking) return;
  // two cards already selected waiting on check timeout
  if (secondCard) return;

  clicks++;
  card.classList.add('flip');

  if (!firstCard)
  {
    // First card of the pair
    firstCard = card;
  }
  else
  {
    // Second card check for a match
    secondCard = card;
    checkMatch();
  }

  updateStatus();
}

function checkMatch()
{
  const a = firstCard;
  const b = secondCard;

  if (a.dataset.img === b.dataset.img)
  {
    // if match mark both as matched after a brief moment
    setTimeout(() =>
    {
      a.classList.add('matched');
      b.classList.add('matched');
      matched++;
      firstCard  = null;
      secondCard = null;
      consecutiveMatches++;

      // Earn a peek every 3 consecutive matches
      if (consecutiveMatches % 3 === 0)
      {
        peeksLeft++;
        syncPeekBtn();
      }

      updateStatus();
      if (matched === totalPairs) endGame(true);
    }, 400);
  }
  else
  {
    // if no match lock clicks and flip both back after a delay
    isChecking = true;
    consecutiveMatches = 0;

    setTimeout(() =>
    {
      a.classList.remove('flip');
      b.classList.remove('flip');
      firstCard  = null;
      secondCard = null;
      isChecking = false;
    }, 1100);
  }
}

function startTimer()
{
  clearInterval(timerId);
  timerId = setInterval(() =>
  {
    if (!running) return;
    timeLeft--;
    updateStatus();

    if (timeLeft <= 10)
    {
      timerVal.className = 'stat-value timer-critical';
    }
    else if (timeLeft <= 20)
    {
      timerVal.className = 'stat-value timer-warn';
    }
    else
    {
      timerVal.className = 'stat-value';
    }

    if (timeLeft <= 0) endGame(false);
  }, 1000);
}

function endGame(won)
{
  running  = false;
  gameOver = true;
  clearInterval(timerId);
  timerVal.className = 'stat-value';
  peekBtn.disabled   = true;

  // Disable all card clicks
  document.querySelectorAll('.game-card').forEach(c => c.style.pointerEvents = 'none');

  const title = document.getElementById('modalTitle');
  const sub   = document.getElementById('modalSub');
  const cfg   = DIFFICULTIES[difficulty];

  if (won)
  {
    title.textContent = 'You Win!';
    const elapsed     = cfg.time - timeLeft;
    sub.textContent   = `Matched all ${totalPairs} pairs in ${elapsed}s with ${clicks} clicks!`;
  }
  else
  {
    title.textContent = 'You Lost!';
    sub.textContent   = `Time's up! You matched ${matched} of ${totalPairs} pairs.`;

    // Reveal all remaining unmatched cards
    document.querySelectorAll('.game-card:not(.matched)').forEach(c => c.classList.add('flip'));
  }

  setTimeout(() => resultModal.show(), 700);
}

function updateStatus()
{
  timerVal.textContent   = (running || gameOver) ? timeLeft : '--';
  clicksVal.textContent  = clicks;
  matchedVal.textContent = matched;
  leftVal.textContent    = totalPairs > 0 ? `${totalPairs - matched}/${totalPairs}` : '--';
  totalVal.textContent   = totalPairs > 0 ? totalPairs : '--';
}

// Reveals all unmatched cards for 2 seconds.
// Starts with 1 use then earn +1 every 3 consecutive matches.
function usePeek()
{
  if (peeksLeft <= 0 || !running || gameOver || peeking) return;

  peeksLeft--;
  peeking = true;
  syncPeekBtn();

  // Flip all face down unmatched cards
  const toReveal = [];
  document.querySelectorAll('.game-card:not(.matched):not(.flip)').forEach(c =>
  {
    toReveal.push(c);
    c.classList.add('flip');
  });
  grid.classList.add('peeking');

  setTimeout(() =>
  {
    // Flip back only the ones we revealed
    toReveal.forEach(c =>
    {
      if (c !== firstCard && c !== secondCard)
      {
        c.classList.remove('flip');
      }
    });
    grid.classList.remove('peeking');
    peeking = false;
    syncPeekBtn();
  }, 2000);
}

function syncPeekBtn()
{
  peekBtn.textContent = `Peek (${peeksLeft})`;
  peekBtn.disabled    = peeksLeft <= 0 || !running || gameOver;
}