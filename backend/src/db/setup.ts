import { pool, closePool } from "./connection.js";

/**
 * Create database schema and insert sample data
 */
async function setup() {
  console.log("🔧 Setting up database...");

  try {
    // Create movies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        title_ja VARCHAR(255) NOT NULL,
        title_en VARCHAR(255),
        description TEXT,
        genre TEXT[] DEFAULT '{}',
        release_year INTEGER,
        rating DECIMAL(2,1),
        director VARCHAR(255),
        actors TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Created movies table");

    // Create indexes for movies
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_movies_title_ja ON movies(title_ja);
      CREATE INDEX IF NOT EXISTS idx_movies_genre ON movies USING GIN(genre);
      CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(release_year);
      CREATE INDEX IF NOT EXISTS idx_movies_rating ON movies(rating DESC);
    `);
    console.log("✅ Created movies indexes");

    // Create conversation_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        user_name VARCHAR(255),
        user_token TEXT,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        domain VARCHAR(50) NOT NULL DEFAULT 'movie',
        emotion VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Created conversation_history table");

    // Create indexes for conversation_history
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_session_id ON conversation_history(session_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_user_id ON conversation_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_domain ON conversation_history(domain);
      CREATE INDEX IF NOT EXISTS idx_conversation_created_at ON conversation_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation_session_domain ON conversation_history(session_id, domain);
      CREATE INDEX IF NOT EXISTS idx_conversation_user_domain ON conversation_history(user_id, domain);
    `);
    console.log("✅ Created conversation_history indexes");

    // Create user_profile table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id SERIAL PRIMARY KEY,
        users_id INTEGER NOT NULL UNIQUE,
        name VARCHAR(255),
        contact_email_address VARCHAR(255),
        nick_name VARCHAR(255),
        birthday DATE,
        gender VARCHAR(50),
        nationality VARCHAR(100),
        prefecture VARCHAR(100),
        district VARCHAR(100),
        image_url VARCHAR(500),
        is_feature INTEGER,
        introduction TEXT,
        twitter_url VARCHAR(500),
        instagram_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_push INTEGER DEFAULT 1,
        facebook_url VARCHAR(500),
        read_nickname VARCHAR(255),
        first_setup_notice INTEGER DEFAULT 0,
        user_search TEXT,
        province VARCHAR(100)
      )
    `);
    console.log("✅ Created user_profile table");

    // Create indexes for user_profile
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_profile_users_id ON user_profile(users_id);
      CREATE INDEX IF NOT EXISTS idx_user_profile_email ON user_profile(contact_email_address);
      CREATE INDEX IF NOT EXISTS idx_user_profile_nick_name ON user_profile(nick_name);
      CREATE INDEX IF NOT EXISTS idx_user_profile_created_at ON user_profile(created_at DESC);
    `);
    console.log("✅ Created user_profile indexes");

    // Create user_archive table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_archive (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        domain VARCHAR(50) NOT NULL CHECK (domain IN ('movie', 'gourmet', 'general')),
        item_id VARCHAR(255) NOT NULL,
        item_title VARCHAR(500),
        item_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, domain, item_id)
      )
    `);
    console.log("✅ Created user_archive table");

    // Create indexes for user_archive
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_archive_user_id ON user_archive(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_archive_domain ON user_archive(domain);
      CREATE INDEX IF NOT EXISTS idx_user_archive_user_domain ON user_archive(user_id, domain);
      CREATE INDEX IF NOT EXISTS idx_user_archive_created_at ON user_archive(created_at DESC);
    `);
    console.log("✅ Created user_archive indexes");

    // Check if we have sample data
    const countResult = await pool.query("SELECT COUNT(*) FROM movies");
    const count = parseInt(countResult.rows[0].count, 10);

    if (count === 0) {
      console.log("📦 Inserting sample movie data...");
      await insertSampleData();
      console.log("✅ Sample data inserted");
    } else {
      console.log(`ℹ️  Database already has ${count} movies`);
    }

    console.log("🎉 Database setup complete!");
  } catch (error) {
    console.error("❌ Setup failed:", error);
    throw error;
  } finally {
    await closePool();
  }
}

async function insertSampleData() {
  const movies = [
    {
      title_ja: "千と千尋の神隠し",
      title_en: "Spirited Away",
      description: "10歳の少女・千尋が神々の世界に迷い込み、豚に変えられた両親を救うため、湯屋で働くことになる物語。",
      genre: ["アニメ", "ファンタジー", "冒険"],
      release_year: 2001,
      rating: 8.6,
      director: "宮崎駿",
      actors: ["柊瑠美", "入野自由", "夏木マリ"],
    },
    {
      title_ja: "君の名は。",
      title_en: "Your Name",
      description: "東京に住む男子高校生と岐阜の山奥に住む女子高校生が、夢の中で入れ替わる不思議な体験をする。",
      genre: ["アニメ", "ロマンス", "ファンタジー"],
      release_year: 2016,
      rating: 8.4,
      director: "新海誠",
      actors: ["神木隆之介", "上白石萌音"],
    },
    {
      title_ja: "もののけ姫",
      title_en: "Princess Mononoke",
      description: "呪いを受けた青年アシタカが、人間と森の神々の戦いに巻き込まれていく壮大な物語。",
      genre: ["アニメ", "ファンタジー", "アクション"],
      release_year: 1997,
      rating: 8.4,
      director: "宮崎駿",
      actors: ["松田洋治", "石田ゆり子", "美輪明宏"],
    },
    {
      title_ja: "天気の子",
      title_en: "Weathering with You",
      description: "家出少年と天気を操る力を持つ少女が、東京で出会い、運命を共にする物語。",
      genre: ["アニメ", "ロマンス", "ファンタジー"],
      release_year: 2019,
      rating: 7.9,
      director: "新海誠",
      actors: ["醍醐虎汰朗", "森七菜"],
    },
    {
      title_ja: "鬼滅の刃 無限列車編",
      title_en: "Demon Slayer: Mugen Train",
      description: "鬼殺隊の炭治郎たちが無限列車で起こる事件に立ち向かう。炎柱・煉獄杏寿郎との出会い。",
      genre: ["アニメ", "アクション", "ファンタジー"],
      release_year: 2020,
      rating: 8.2,
      director: "外崎春雄",
      actors: ["花江夏樹", "鬼頭明里", "日野聡"],
    },
    {
      title_ja: "となりのトトロ",
      title_en: "My Neighbor Totoro",
      description: "田舎に引っ越してきた姉妹が、森に住む不思議な生き物トトロと出会い、心温まる冒険を繰り広げる。",
      genre: ["アニメ", "ファンタジー", "家族"],
      release_year: 1988,
      rating: 8.1,
      director: "宮崎駿",
      actors: ["日高のり子", "坂本千夏", "糸井重里"],
    },
    {
      title_ja: "アキラ",
      title_en: "Akira",
      description: "ネオ東京を舞台に、超能力を持つ少年たちの壮絶な戦いを描くサイバーパンクの傑作。",
      genre: ["アニメ", "SF", "アクション"],
      release_year: 1988,
      rating: 8.0,
      director: "大友克洋",
      actors: ["岩田光央", "佐々木望", "小山茉美"],
    },
    {
      title_ja: "七人の侍",
      title_en: "Seven Samurai",
      description: "戦国時代、野武士に襲われる農村を守るため、七人の侍が集められる。",
      genre: ["時代劇", "アクション", "ドラマ"],
      release_year: 1954,
      rating: 8.6,
      director: "黒澤明",
      actors: ["三船敏郎", "志村喬", "稲葉義男"],
    },
    {
      title_ja: "おくりびと",
      title_en: "Departures",
      description: "元チェロ奏者が納棺師の仕事に就き、死者を送り出す仕事を通じて人生の意味を見出していく。",
      genre: ["ドラマ", "音楽"],
      release_year: 2008,
      rating: 8.1,
      director: "滝田洋二郎",
      actors: ["本木雅弘", "広末涼子", "山崎努"],
    },
    {
      title_ja: "万引き家族",
      title_en: "Shoplifters",
      description: "犯罪で繋がった疑似家族の物語。貧困の中で生きる人々の絆と愛を描く。",
      genre: ["ドラマ", "犯罪"],
      release_year: 2018,
      rating: 8.0,
      director: "是枝裕和",
      actors: ["リリー・フランキー", "安藤サクラ", "樹木希林"],
    },
    {
      title_ja: "リング",
      title_en: "Ring",
      description: "見たら一週間後に死ぬという呪いのビデオテープの謎を追うジャーナリストの恐怖体験。",
      genre: ["ホラー", "サスペンス"],
      release_year: 1998,
      rating: 7.3,
      director: "中田秀夫",
      actors: ["松嶋菜々子", "真田広之", "中谷美紀"],
    },
    {
      title_ja: "バトル・ロワイアル",
      title_en: "Battle Royale",
      description: "政府に選ばれた中学生たちが、最後の一人になるまで殺し合いを強制される。",
      genre: ["アクション", "スリラー", "SF"],
      release_year: 2000,
      rating: 7.6,
      director: "深作欣二",
      actors: ["藤原竜也", "前田亜季", "山本太郎"],
    },
    {
      title_ja: "シン・ゴジラ",
      title_en: "Shin Godzilla",
      description: "東京湾に突如現れた巨大生物に、日本政府が立ち向かう。現代日本を舞台にしたゴジラ映画。",
      genre: ["SF", "アクション", "怪獣"],
      release_year: 2016,
      rating: 7.6,
      director: "庵野秀明",
      actors: ["長谷川博己", "石原さとみ", "竹野内豊"],
    },
    {
      title_ja: "パプリカ",
      title_en: "Paprika",
      description: "夢に侵入できる装置が盗まれ、現実と夢の境界が崩壊し始める。サイコロジカルSFアニメ。",
      genre: ["アニメ", "SF", "サスペンス"],
      release_year: 2006,
      rating: 7.7,
      director: "今敏",
      actors: ["林原めぐみ", "江守徹", "堀勝之祐"],
    },
    {
      title_ja: "サマーウォーズ",
      title_en: "Summer Wars",
      description: "仮想世界OZを舞台に、AIの暴走に立ち向かう高校生と大家族の夏の冒険。",
      genre: ["アニメ", "SF", "家族"],
      release_year: 2009,
      rating: 7.6,
      director: "細田守",
      actors: ["神木隆之介", "桜庭ななみ", "富司純子"],
    },
  ];

  for (const movie of movies) {
    await pool.query(
      `INSERT INTO movies (title_ja, title_en, description, genre, release_year, rating, director, actors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        movie.title_ja,
        movie.title_en,
        movie.description,
        movie.genre,
        movie.release_year,
        movie.rating,
        movie.director,
        movie.actors,
      ]
    );
  }
}

// Run setup
setup().catch(console.error);
