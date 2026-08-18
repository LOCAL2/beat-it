import { useState, useRef, useEffect } from 'react';
import './App.css';
import { supabase, generateUUID } from './supabase';

interface CurrentItem {
  nameEn: string;
  nameTh: string;
  emoji?: string;
}

interface GeminiResult {
  win: boolean;
  reason: string;
  nextNameEn: string;
  nextNameTh: string;
  emoji: string;
}

interface HistoryRound {
  challengeEn: string;
  challengeTh: string;
  response: string;
  win: boolean;
  reason: string;
  mode: 'beat' | 'lose';
}

interface HistorySession {
  id: string; // unique Hex ID, e.g. "E3A8F2"
  timestamp: string;
  rounds: HistoryRound[];
}

// Helper to generate a random 6-character Hex ID
function generateSessionHexId(): string {
  return Math.floor(Math.random() * 16777215)
    .toString(16)
    .toUpperCase()
    .padStart(6, '0');
}

// Default silhouette avatar placeholder
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

function App() {
  // Key setup states
  const [apiKey, setApiKey] = useState<string>(() => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const localKey = localStorage.getItem('gemini_api_key') || '';
    return (envKey || localKey).trim();
  });
  const [tempKey, setTempKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(() => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const localKey = localStorage.getItem('gemini_api_key') || '';
    return !(envKey.trim() || localKey.trim());
  });

  // User Profile states
  const [userId] = useState(() => {
    let id = localStorage.getItem('beat_it_user_id');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('beat_it_user_id', id);
    }
    return id;
  });
  const [username, setUsername] = useState(() => localStorage.getItem('beat_it_username') || '');
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem('beat_it_avatar_url') || DEFAULT_AVATAR);
  const [hasSetupProfile, setHasSetupProfile] = useState(() => localStorage.getItem('beat_it_profile_setup') === 'true');
  
  // Game Modes & High Scores
  const [gameMode, setGameMode] = useState<'beat' | 'lose'>(() => {
    const savedMode = localStorage.getItem('beat_it_game_mode');
    return (savedMode === 'lose' ? 'lose' : 'beat');
  });
  const [highScoreBeat, setHighScoreBeat] = useState<number>(() => {
    const legacyHigh = localStorage.getItem('beat_it_highscore') || '0';
    const savedBeat = localStorage.getItem('beat_it_highscore_beat');
    return Number(savedBeat !== null ? savedBeat : legacyHigh);
  });
  const [highScoreLose, setHighScoreLose] = useState<number>(() => {
    return Number(localStorage.getItem('beat_it_highscore_lose') || '0');
  });

  // Temporary setup/edit states
  const [setupUsername, setSetupUsername] = useState(username);
  const [setupAvatar, setSetupAvatar] = useState(avatarUrl);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Tab & Leaderboard States
  const [activeTab, setActiveTab] = useState<'play' | 'leaderboard' | 'history'>('play');
  const [leaderboardMode, setLeaderboardMode] = useState<'beat' | 'lose'>('beat');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Game Play States
  const [currentItem, setCurrentItem] = useState<CurrentItem>({
    nameEn: 'Rock',
    nameTh: 'หิน',
    emoji: '🪨',
  });
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState('');
  
  // Current game run scores
  const [scoreBeat, setScoreBeat] = useState(0);
  const [scoreLose, setScoreLose] = useState(0);
  const [points, setPoints] = useState<number>(() => {
    return Number(localStorage.getItem('beat_it_points') || '0');
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [pendingNextItem, setPendingNextItem] = useState<CurrentItem | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Unique session Hex ID for this browser load/refresh
  const currentSessionId = useRef<string>('');
  useEffect(() => {
    currentSessionId.current = generateSessionHexId();
  }, []);

  // Fetch image from Unsplash Proxy on currentItem changes
  useEffect(() => {
    if (showKeyInput || !hasSetupProfile) return;
    
    let isMounted = true;
    setImageLoading(true);
    setImageUrl('');

    const fetchUnsplashImage = async () => {
      try {
        const query = encodeURIComponent(currentItem.nameEn);
        const res = await fetch(
          `/api-unsplash/search/photos?query=${query}&per_page=1`
        );
        if (!res.ok) throw new Error('Network error');
        
        const data = await res.json();
        const firstPhoto = data.results?.[0];
        const sourceUrl = firstPhoto?.urls?.small || firstPhoto?.urls?.regular;
        if (sourceUrl && isMounted) {
          setImageUrl(sourceUrl);
          return;
        }
      } catch (err) {
        console.error('Failed to load image from Unsplash:', err);
      } finally {
        if (isMounted) {
          setImageLoading(false);
        }
      }
    };

    fetchUnsplashImage();

    return () => {
      isMounted = false;
    };
  }, [currentItem, showKeyInput, hasSetupProfile]);

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      setLeaderboardLoading(true);
      const columnOrder = leaderboardMode === 'beat' ? 'streak_beat' : 'streak_lose';
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order(columnOrder, { ascending: false })
        .limit(20);
      
      if (error) throw error;
      if (data) {
        setLeaderboard(data);
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // Subscribe to Realtime Leaderboard updates
  useEffect(() => {
    if (showKeyInput || !hasSetupProfile) return;

    fetchLeaderboard();

    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leaderboard' },
        () => {
          fetchLeaderboard();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showKeyInput, hasSetupProfile, leaderboardMode]);

  // Sync high scores to Supabase
  const syncStreaksToSupabase = async (beatHigh: number, loseHigh: number, currentPoints: number) => {
    if (!userId || !username) return;
    try {
      await supabase.from('leaderboard').upsert({
        id: userId,
        username: username,
        avatar_url: avatarUrl,
        streak_beat: beatHigh,
        streak_lose: loseHigh,
        points: currentPoints,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to sync streaks to Supabase:', err);
    }
  };

  // Helper to resize/compress uploaded profile image to 96x96
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 96, 96);
          const base64Url = canvas.toDataURL('image/jpeg', 0.8);
          setSetupAvatar(base64Url);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Setup profile initial logic
  const handleInitialProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = setupUsername.trim();
    if (!cleanUsername) return;

    localStorage.setItem('beat_it_username', cleanUsername);
    localStorage.setItem('beat_it_avatar_url', setupAvatar);
    localStorage.setItem('beat_it_profile_setup', 'true');
    
    setUsername(cleanUsername);
    setAvatarUrl(setupAvatar);
    setHasSetupProfile(true);

    // Initial sync
    try {
      await supabase.from('leaderboard').upsert({
        id: userId,
        username: cleanUsername,
        avatar_url: setupAvatar,
        streak_beat: highScoreBeat,
        streak_lose: highScoreLose,
        points: points,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Supabase initial profile sync error:', err);
    }
  };

  // Update profile edit logic
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = setupUsername.trim();
    if (!cleanUsername) return;

    localStorage.setItem('beat_it_username', cleanUsername);
    localStorage.setItem('beat_it_avatar_url', setupAvatar);
    
    setUsername(cleanUsername);
    setAvatarUrl(setupAvatar);
    setShowProfileModal(false);

    // Sync updated info
    try {
      await supabase.from('leaderboard').upsert({
        id: userId,
        username: cleanUsername,
        avatar_url: setupAvatar,
        streak_beat: highScoreBeat,
        streak_lose: highScoreLose,
        points: points,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Supabase profile update sync error:', err);
    }
  };

  useEffect(() => {
    if (!showKeyInput && hasSetupProfile && !isSuccess && activeTab === 'play') {
      inputRef.current?.focus();
    }
  }, [currentItem, showKeyInput, hasSetupProfile, isSuccess, activeTab, gameMode]);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempKey.trim()) {
      localStorage.setItem('gemini_api_key', tempKey.trim());
      setApiKey(tempKey.trim());
      setShowKeyInput(false);
    }
  };



  // Log round to local storage history
  const logRoundToHistory = (round: HistoryRound) => {
    try {
      const historyStr = localStorage.getItem('beat_it_history') || '[]';
      const history: HistorySession[] = JSON.parse(historyStr);
      
      let session = history.find(s => s.id === currentSessionId.current);
      if (!session) {
        session = {
          id: currentSessionId.current,
          timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date().toLocaleDateString('th-TH'),
          rounds: []
        };
        history.unshift(session);
      }
      
      session.rounds.unshift(round);
      localStorage.setItem('beat_it_history', JSON.stringify(history));
    } catch (err) {
      console.error('Failed to save to play history:', err);
    }
  };

  const handleNextItem = () => {
    if (pendingNextItem) {
      setCurrentItem(pendingNextItem);
      setPendingNextItem(null);
    }
    setInputValue('');
    setIsSuccess(false);
    setExplanation(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If successfully won, pressing enter or submitting proceeds to the next level
    if (isSuccess && pendingNextItem) {
      handleNextItem();
      return;
    }

    const answer = inputValue.trim();
    if (!answer || isLoading) return;

    if (!apiKey) {
      setShowKeyInput(true);
      return;
    }

    // Skip logic
    if (answer.toLowerCase() === 'skip' || answer === 'ข้าม') {
      const newPoints = Math.max(0, points - 1);
      setPoints(newPoints);
      localStorage.setItem('beat_it_points', String(newPoints));
      syncStreaksToSupabase(highScoreBeat, highScoreLose, newPoints);
      
      logRoundToHistory({
        challengeEn: currentItem.nameEn,
        challengeTh: currentItem.nameTh,
        response: answer,
        win: false,
        reason: 'ผู้เล่นทำการข้าม (โดนหัก 1 แต้ม)',
        mode: gameMode
      });
      
      handleNextItem();
      return;
    }

    setIsLoading(true);
    setExplanation(null);

    const isBeatMode = gameMode === 'beat';
    const promptText = `
You are a referee for a game of "${isBeatMode ? 'What beats this?' : 'What loses to this?'}".
The current challenge item is: "${currentItem.nameEn} / ${currentItem.nameTh}".
The user responds with: "${answer}".

IMPORTANT: This is NOT a game of Rock-Paper-Scissors. Do NOT use classic Rock-Paper-Scissors rules.
Instead, decide if the user's item ${isBeatMode ? 'beats' : 'loses to'} the current challenge item based on real-world physics, logic, chemistry, or creative/metaphorical matchups.

For example, Fire can burn and destroy most objects, making Fire the winner against Rock, not Rock winning against Fire.

${isBeatMode ? `
For "What beats this?" mode:
- User wins if their item beats the challenge item.
- Example: Challenge is "Rock", User answers "Fire" -> Win (true) because Fire melts/burns Rock.
- Example: Challenge is "Rock", User answers "Hammer" -> Win (true) because Hammer smashes Rock.
- Example: Challenge is "Fire", User answers "Water" -> Win (true) because Water extinguishes Fire.
- Example: Challenge is "Rock", User answers "Paper" -> Lose (false) (in real life Paper doesn't physically beat Rock).
` : `
For "What loses to this?" mode:
- User wins if their item loses to the challenge item (i.e. the challenge item beats the user's item).
- Example: Challenge is "Rock", User answers "Scissors" -> Win (true) because Scissors loses to Rock (Rock smashes Scissors).
- Example: Challenge is "Fire", User answers "Rock" -> Win (true) because Rock is melted/beaten by Fire.
- Example: Challenge is "Fire", User answers "Wood" -> Win (true) because Wood is consumed/beaten by Fire.
- Example: Challenge is "Water", User answers "Fire" -> Win (true) because Fire is extinguished/beaten by Water.
- Example: Challenge is "Rock", User answers "Hammer" -> Lose (false) because Hammer beats Rock (doesn't lose to it).
`}

Return your judgment as a JSON object:
{
  "win": boolean,
  "reason": "A long, highly informative, yet very sarcastic and slightly trollish explanation of why the user's item wins (matching the mode rules) or loses. If the user answered in Thai, write the reason in Thai. If in English, write in English. Do NOT include any emojis in the explanation text.",
  "nextNameEn": "Name of the user's item in English (only if win is true, otherwise empty string). Capitalize it. Do not include emojis.",
  "nextNameTh": "Name of the user's item in Thai (only if win is true, otherwise empty string). Do not include emojis.",
  "emoji": "A single appropriate emoji representing the user's item (only if win is true, otherwise empty string)"
}
`;

    try {
      const response = await fetch(
        `/api-check?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("API Error Response:", errText);
        throw new Error(`เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (Status ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('ไม่ได้รับข้อมูลการวิเคราะห์จาก AI');

      const result: GeminiResult = JSON.parse(text);

      setExplanation(result.reason);

      // Log to play history
      logRoundToHistory({
        challengeEn: currentItem.nameEn,
        challengeTh: currentItem.nameTh,
        response: answer,
        win: result.win,
        reason: result.reason,
        mode: gameMode
      });

      if (result.win) {
        setIsSuccess(true);
        const newPoints = points + 1;
        setPoints(newPoints);
        localStorage.setItem('beat_it_points', String(newPoints));
        
        if (isBeatMode) {
          const newScore = scoreBeat + 1;
          setScoreBeat(newScore);
          if (newScore > highScoreBeat) {
            setHighScoreBeat(newScore);
            localStorage.setItem('beat_it_highscore_beat', String(newScore));
            syncStreaksToSupabase(newScore, highScoreLose, newPoints);
          } else {
            syncStreaksToSupabase(highScoreBeat, highScoreLose, newPoints);
          }
        } else {
          const newScore = scoreLose + 1;
          setScoreLose(newScore);
          if (newScore > highScoreLose) {
            setHighScoreLose(newScore);
            localStorage.setItem('beat_it_highscore_lose', String(newScore));
            syncStreaksToSupabase(highScoreBeat, newScore, newPoints);
          } else {
            syncStreaksToSupabase(highScoreBeat, highScoreLose, newPoints);
          }
        }

        setPendingNextItem({
          nameEn: result.nextNameEn || answer,
          nameTh: result.nextNameTh || answer,
          emoji: result.emoji || '❓'
        });
      } else {
        setIsError(true);
        // Reset current score run on lose
        if (isBeatMode) {
          setScoreBeat(0);
        } else {
          setScoreLose(0);
        }
        setTimeout(() => setIsError(false), 500);
      }
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsLoading(false);
    }
  };

  // Open modal helper to pre-fill inputs
  const openEditProfile = () => {
    setSetupUsername(username);
    setSetupAvatar(avatarUrl);
    setShowProfileModal(true);
  };

  // Switch game mode manually
  const handleSwitchMode = (mode: 'beat' | 'lose') => {
    setGameMode(mode);
    localStorage.setItem('beat_it_game_mode', mode);
    
    // Reset play run state
    setInputValue('');
    setIsSuccess(false);
    setExplanation(null);
    setPendingNextItem(null);
    setCurrentItem({
      nameEn: 'Rock',
      nameTh: 'หิน',
      emoji: '🪨',
    });
  };

  // Switch leaderboard display mode
  const handleSwitchLeaderboardMode = (mode: 'beat' | 'lose') => {
    setLeaderboardMode(mode);
  };

  // Retrieve play history
  const getPlayHistory = (): HistorySession[] => {
    try {
      const historyStr = localStorage.getItem('beat_it_history') || '[]';
      return JSON.parse(historyStr);
    } catch (err) {
      return [];
    }
  };

  const playHistory = getPlayHistory();
  const currentActiveScore = gameMode === 'beat' ? scoreBeat : scoreLose;

  return (
    <div className="app-container">
      
      {/* 1. INITIAL SETUP SCREENS (Rendered as centered boxes) */}
      {!hasSetupProfile ? (
        <div className="setup-container">
          <div className="game-card setup-card">
            <div className="title-area">
              <h1>Beat It</h1>
              <p>Setup Profile</p>
            </div>
            <form onSubmit={handleInitialProfileSetup} className="profile-setup-form">
              <div className="input-field-group center-uploader">
                <label className="input-label">รูปภาพโปรไฟล์ (Profile Picture)</label>
                <div className="avatar-uploader-container">
                  <label 
                    htmlFor="avatar-file-setup"
                    className="avatar-preview-circle" 
                    style={setupAvatar && setupAvatar !== DEFAULT_AVATAR ? { backgroundImage: `url(${setupAvatar})` } : {}}
                    title="คลิกเพื่อเลือกรูปภาพ"
                  >
                    {(!setupAvatar || setupAvatar === DEFAULT_AVATAR) && (
                      <div className="default-silhouette">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      </div>
                    )}
                    <div className="camera-badge">
                      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                        <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.12-1.12A1 1 0 009.878 3H6.122a1 1 0 00-.707.293L4.293 4.707a1 1 0 01-.707-.293L4.293 4.707A1 1 0 013.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </label>
                  <input
                    id="avatar-file-setup"
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              <div className="input-field-group">
                <label className="input-label">ชื่อที่จะให้แสดง (Display Name) <span className="required">*</span></label>
                <input
                  type="text"
                  className="game-input-bordered"
                  placeholder="ชื่อของคุณ..."
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  maxLength={15}
                  required
                />
              </div>
              
              <button type="submit" className="save-profile-btn">
                เริ่มเล่นเกม
              </button>
            </form>
          </div>
        </div>
      ) : showKeyInput ? (
        <div className="setup-container">
          <div className="game-card setup-card">
            <h2 className="key-setup-title">Setup Gemini Key</h2>
            <p className="key-setup-desc">กรุณาใส่ API Key เพื่อเปิดใช้งานระบบผู้ตัดสิน AI</p>
            <form onSubmit={handleSaveKey} className="input-form">
              <div className="input-container">
                <input
                  type="password"
                  className="game-input"
                  placeholder="AIzaSy..."
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  required
                />
                <button type="submit" className="enter-button">
                  Save
                </button>
              </div>
            </form>
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
              className="api-link-btn"
            >
              ขอ API Key ฟรีได้ที่นี่ ↗
            </a>
          </div>
        </div>
      ) : (
        
        // 2. FULL WEB PAGE WORKSPACE LAYOUT
        <div className="app-workspace">
          {/* Header Navigation Bar */}
          <header className="app-header">
            <div className="header-left">
              <div className="app-logo">
                <span>Beat It</span>
              </div>
            </div>
            
            <div className="header-tabs">
              <button 
                className={`nav-tab-btn ${activeTab === 'play' ? 'active' : ''}`}
                onClick={() => setActiveTab('play')}
              >
                Play Game
              </button>
              <button 
                className={`nav-tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('leaderboard')}
              >
                Leaderboard
              </button>
              <button 
                className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                History
              </button>
            </div>

            <div className="header-right">
              <button className="profile-trigger" onClick={openEditProfile}>
                <div 
                  className="profile-avatar" 
                  style={avatarUrl && avatarUrl !== DEFAULT_AVATAR ? { backgroundImage: `url(${avatarUrl})` } : {}} 
                />
                <span className="profile-name">{username}</span>
              </button>
              <div className="score-badge">
                <span className="badge-dot"></span>
                <span className="badge-label">Streak</span>
                <span className="badge-value">{currentActiveScore}</span>
              </div>

            </div>
          </header>

          {/* Main Layout Grid */}
          <div className="workspace-grid">
            
            {/* LEFT COLUMN: Main content area */}
            <main className="workspace-main">
              {activeTab === 'play' ? (
                <div className="play-zone-card">
                  {/* Mode selector at top of Play */}
                  <div className="play-header-row">
                    <div className="mode-selector">
                      <button 
                        className={`mode-btn ${gameMode === 'beat' ? 'active' : ''}`}
                        onClick={() => handleSwitchMode('beat')}
                      >
                        <svg className="mode-btn-beat-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                        ชนะมัน (Beat It)
                      </button>
                      <button 
                        className={`mode-btn ${gameMode === 'lose' ? 'active' : ''}`}
                        onClick={() => handleSwitchMode('lose')}
                      >
                        <svg className="mode-btn-lose-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 1a9 9 0 100 18A9 9 0 0010 1zm0 2a7 7 0 110 14A7 7 0 0110 3zm-.75 3.75a.75.75 0 011.5 0v5.19l2.47 2.47a.75.75 0 11-1.06 1.06l-2.75-2.75A.75.75 0 019.25 12V6.75z" clipRule="evenodd" />
                        </svg>
                        แพ้มัน (Lose to It)
                      </button>
                    </div>
                  </div>

                  <div className="play-content-body">
                    {/* Item display visual */}
                    <div className="play-item-display-column">
                      <div className="item-display">
                        <div className={`image-frame ${isSuccess ? 'success-pop' : ''} ${imageLoading ? 'image-skeleton' : ''}`}>
                          {imageUrl ? (
                            <img 
                              src={imageUrl} 
                              alt={currentItem.nameEn}
                              className="item-image"
                              key={currentItem.nameEn}
                              loading="lazy"
                            />
                          ) : (
                            !imageLoading && (
                              <div className="image-fallback" style={{ fontSize: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
                                {currentItem.emoji || '❓'}
                              </div>
                            )
                          )}
                        </div>
                        <h2 className="item-title">
                          <span className="title-en">{currentItem.nameEn}</span>
                          <span className="title-divider">/</span>
                          <span className="title-th">{currentItem.nameTh}</span>
                        </h2>
                      </div>
                    </div>

                    {/* Reasoning and Form controls */}
                    <div className="play-control-column">
                      <div className="play-control-box">
                        <div className="title-area">
                          <h1>{gameMode === 'beat' ? 'Beat It' : 'Lose to It'}</h1>
                          <p>{gameMode === 'beat' ? 'ป้อนสิ่งที่ชนะโจทย์ด้านล่าง...' : 'ป้อนสิ่งที่แพ้โจทย์ด้านล่าง...'}</p>
                        </div>

                        {explanation && (
                          <div className={`reasoning-panel ${isSuccess ? 'win' : 'lose'}`}>
                            <div className="verdict-header">
                              {isSuccess ? (
                                <>
                                  <svg className="verdict-icon win" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.8-11.2a1 1 0 00-1.4-1.4L9 8.6 7.6 7.2a1 1 0 00-1.4 1.4l2.1 2.1a1 1 0 001.4 0l3.8-3.9z" clipRule="evenodd" />
                                  </svg>
                                  <span>ชนะ</span>
                                </>
                              ) : (
                                <>
                                  <svg className="verdict-icon lose" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 7a1 1 0 110 2 1 1 0 010-2zm-1 4a1 1 0 102 0v2a1 1 0 10-2 0v-2z" clipRule="evenodd" />
                                  </svg>
                                  <span>แพ้</span>
                                </>
                              )}
                            </div>
                            <p className="reasoning-text">{explanation}</p>
                          </div>
                        )}

                        <form onSubmit={handleSubmit} className="input-form">
                          {isSuccess ? (
                            <button 
                              type="submit" 
                              className="next-level-button" 
                              ref={(btn) => btn?.focus()}
                            >
                              <span>ด่านต่อไป (Next Level)</span>
                              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          ) : (
                            <div className={`input-container ${isError ? 'shake' : ''}`}>
                              <input
                                ref={inputRef}
                                type="text"
                                className="game-input"
                                placeholder={isLoading ? 'AI กำลังตัดสิน...' : gameMode === 'beat' ? 'ป้อนสิ่งที่เอาชนะ...' : 'ป้อนสิ่งที่ยอมแพ้...'}
                                value={inputValue}
                                onChange={(e) => {
                                  setInputValue(e.target.value);
                                  if (explanation && !isSuccess) {
                                    setExplanation(null);
                                  }
                                }}
                                disabled={isLoading}
                                autoComplete="off"
                                spellCheck="false"
                              />
                              <button type="submit" className="enter-button" disabled={isLoading}>
                                {isLoading ? (
                                  <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="16" height="16">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                                    <path d="M12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.0434 16.4527" stroke="currentColor" strokeLinecap="round" />
                                  </svg>
                                ) : 'Enter'}
                              </button>
                            </div>
                          )}
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'leaderboard' ? (
                // TAB 2: Leaderboard
                <div className="play-zone-card leaderboard-zone-card">
                  <div className="leaderboard-area">
                    <div className="title-area">
                      <h1>Leaderboard</h1>
                      <p>อันดับคะแนน Streak สูงสุด (Realtime)</p>
                    </div>

                    <div className="mode-selector">
                      <button 
                        className={`mode-btn ${leaderboardMode === 'beat' ? 'active' : ''}`}
                        onClick={() => handleSwitchLeaderboardMode('beat')}
                      >
                        ชนะมัน (Beat It)
                      </button>
                      <button 
                        className={`mode-btn ${leaderboardMode === 'lose' ? 'active' : ''}`}
                        onClick={() => handleSwitchLeaderboardMode('lose')}
                      >
                        แพ้มัน (Lose to It)
                      </button>
                    </div>

                    {leaderboardLoading && leaderboard.length === 0 ? (
                      <div className="leaderboard-loader">
                        <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="24" height="24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                          <path d="M12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.0434 16.4527" stroke="currentColor" strokeLinecap="round" />
                        </svg>
                        <span>กำลังโหลดตารางคะแนน...</span>
                      </div>
                    ) : (
                      <div className="leaderboard-list">
                        {leaderboard.length === 0 ? (
                          <div className="leaderboard-empty">ยังไม่มีสถิติในขณะนี้ มาเริ่มสร้างสถิติกันเลย!</div>
                        ) : (
                          leaderboard.map((player, index) => {
                            const isMe = player.id === userId;
                            const rank = index + 1;
                            const displayStreak = leaderboardMode === 'beat' ? player.streak_beat : player.streak_lose;
                            return (
                              <div key={player.id} className={`leaderboard-row ${isMe ? 'highlight-row' : ''}`}>
                                <div className="player-rank-area">
                                  <span className={`rank-number rank-${rank}`}>{rank}</span>
                                </div>
                                <div 
                                  className="player-avatar" 
                                  style={player.avatar_url && player.avatar_url !== DEFAULT_AVATAR ? { backgroundImage: `url(${player.avatar_url})` } : {}} 
                                />
                                <div className="player-info">
                                  <span className="player-name">
                                    {player.username}
                                    {isMe && <span className="you-badge">You</span>}
                                  </span>
                                </div>
                                <div className="player-points" style={{ marginRight: '1rem', textAlign: 'right' }}>
                                  <span style={{ color: '#0ea5e9', fontWeight: 'bold' }}>{player.points || 0} ⭐️</span>
                                </div>
                                <div className="player-streak">
                                  <span className="streak-value">{displayStreak !== undefined ? displayStreak : 0}</span>
                                  <span className="streak-fire">🔥</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // TAB 3: History
                <div className="play-zone-card history-zone-card">
                  <div className="history-area">
                    <div className="title-area">
                      <h1>Play History</h1>
                      <p>ประวัติการเล่นทั้งหมดของคุกคุณแบ่งตามเซสชัน</p>
                    </div>

                    <div className="history-list">
                      {playHistory.length === 0 ? (
                        <div className="leaderboard-empty">ยังไม่มีประวัติการเล่นในขณะนี้</div>
                      ) : (
                        playHistory.map((session) => (
                          <div key={session.id} className="history-session-card">
                            <div className="session-card-header">
                              <span className="session-hex-id">Session: #{session.id}</span>
                              <span className="session-time">{session.timestamp}</span>
                            </div>
                            <div className="session-rounds-list">
                              {session.rounds.map((round, idx) => (
                                <div key={idx} className="history-round-item">
                                  <div className="round-item-top">
                                    <span className={`round-verdict-badge ${round.win ? 'win' : 'lose'}`}>
                                      {round.win ? 'ชนะ' : 'แพ้'}
                                    </span>
                                    <span className="history-mode-pill">
                                      {round.mode === 'lose' ? 'แพ้มัน' : 'ชนะมัน'}
                                    </span>
                                    <div className="round-matchup-text">
                                      <span className="round-challenge">{round.challengeEn} ({round.challengeTh})</span>
                                      <span className="vs-arrow">←</span>
                                      <span className="round-response">{round.response}</span>
                                    </div>
                                  </div>
                                  <p className="round-reason-text">{round.reason}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </main>

            {/* RIGHT COLUMN: Sidebar (Scores, quick stats & active session log) */}
            <aside className="workspace-sidebar">
              {/* High Score panel */}
              <div className="sidebar-card">
                <h3>สถิติสูงสุด (Highscores)</h3>
                <div className="highscore-stats-grid">
                  <div className="highscore-stat-box" style={{ gridColumn: 'span 2' }}>
                    <span className="stat-label">แต้มสะสมรวม (Total Points)</span>
                    <span className="stat-value" style={{ color: '#0ea5e9' }}>{points} ⭐️</span>
                  </div>
                  <div className="highscore-stat-box">
                    <span className="stat-label">ชนะมัน (Beat It)</span>
                    <span className="stat-value">{highScoreBeat} 🔥</span>
                  </div>
                  <div className="highscore-stat-box">
                    <span className="stat-label">แพ้มัน (Lose to It)</span>
                    <span className="stat-value">{highScoreLose} 🔥</span>
                  </div>
                </div>
              </div>

              {/* Sidebar Quick session info */}
              <div className="sidebar-card">
                <h3>รอบเล่นเซสชันปัจจุบัน</h3>
                <span className="session-hex-tag">รหัสเซสชัน: #{currentSessionId.current}</span>
                <div className="sidebar-rounds-list">
                  {playHistory.find(s => s.id === currentSessionId.current)?.rounds.slice(0, 5).map((round, idx) => (
                    <div key={idx} className="sidebar-round-mini">
                      <span className={`mini-verdict ${round.win ? 'win' : 'lose'}`}>
                        {round.win ? '✓' : '✗'}
                      </span>
                      <span className="mini-match">
                        {round.response} {round.mode === 'lose' ? 'แพ้' : 'ชนะ'} {round.challengeEn}
                      </span>
                    </div>
                  )) || (
                    <div className="sidebar-empty-state">ยังไม่มีการเล่นในเซสชันนี้</div>
                  )}
                </div>
              </div>
            </aside>

          </div>
        </div>
      )}

      {/* 3. Profile Edit Modal Overlay */}
      {showProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>แก้ไขโปรไฟล์</h3>
              <button className="close-modal-btn" onClick={() => setShowProfileModal(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="profile-setup-form">
              <div className="input-field-group center-uploader">
                <label className="input-label">รูปภาพโปรไฟล์ (Profile Picture)</label>
                <div className="image-uploader-wrapper">
                  <label 
                    htmlFor="avatar-file-edit"
                    className="avatar-preview-circle" 
                    style={setupAvatar && setupAvatar !== DEFAULT_AVATAR ? { backgroundImage: `url(${setupAvatar})` } : {}}
                    title="คลิกเพื่อเปลี่ยนรูปภาพ"
                  >
                    {(!setupAvatar || setupAvatar === DEFAULT_AVATAR) && (
                      <div className="default-silhouette">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      </div>
                    )}
                    <div className="camera-badge">
                      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                        <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.12-1.12A1 1 0 009.878 3H6.122a1 1 0 00-.707.293L4.293 4.707a1 1 0 01-.707-.293L4.293 4.707A1 1 0 013.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </label>
                  <input
                    id="avatar-file-edit"
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              <div className="input-field-group">
                <label className="input-label">ชื่อที่จะให้แสดง (Display Name) <span className="required">*</span></label>
                <input
                  type="text"
                  className="game-input-bordered"
                  placeholder="ชื่อของคุณ..."
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  maxLength={15}
                  required
                />
              </div>
              
              <button type="submit" className="save-profile-btn">
                บันทึกการเปลี่ยนแปลง
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
