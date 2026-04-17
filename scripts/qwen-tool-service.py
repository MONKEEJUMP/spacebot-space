"""
LUCY Tool Service — Powered by Qwen-Agent
Space Bot Engineering — April 2026

Uses Alibaba's Qwen-Agent framework for native function calling.
QWEN decides which tools to call. Our tools execute the APIs.
QWEN presents the results.
"""

import json
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo
from http.server import HTTPServer, BaseHTTPRequestHandler

from qwen_agent.agents import Assistant
from qwen_agent.tools.base import BaseTool, register_tool


# ═══════════════════════════════════════════════════════
# TOOL 1: GET NHL SCORES
# ═══════════════════════════════════════════════════════

@register_tool('get_nhl_scores')
class GetNHLScores(BaseTool):
    description = 'Get NHL hockey game scores and results. Use for questions about hockey games, NHL scores, who won in hockey.'
    parameters = [{
        'name': 'date',
        'type': 'string',
        'description': 'Date in YYYYMMDD format. Use today for current games, yesterday for last night results.',
        'required': True,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            date = args.get('date', datetime.now(ZoneInfo('America/Chicago')).strftime('%Y%m%d'))
            url = f'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates={date}'
            req = urllib.request.Request(url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
            if not data.get('events'):
                return json.dumps({'result': f'No NHL games found for {date}'})
            games = []
            for event in data['events']:
                comps = event.get('competitions', [{}])[0].get('competitors', [])
                if len(comps) >= 2:
                    away = next((c for c in comps if c.get('homeAway') == 'away'), comps[0])
                    home = next((c for c in comps if c.get('homeAway') == 'home'), comps[1])
                    status = event.get('status', {}).get('type', {}).get('description', 'Final')
                    games.append({
                        'away_team': away['team']['displayName'],
                        'away_score': away.get('score', '0'),
                        'home_team': home['team']['displayName'],
                        'home_score': home.get('score', '0'),
                        'status': status,
                    })
            return json.dumps({'games': games, 'count': len(games), 'date': date}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 2: GET NBA SCORES
# ═══════════════════════════════════════════════════════

@register_tool('get_nba_scores')
class GetNBAScores(BaseTool):
    description = 'Get NBA basketball game scores and results. Use for questions about basketball games, NBA scores, who won in basketball.'
    parameters = [{
        'name': 'date',
        'type': 'string',
        'description': 'Date in YYYYMMDD format. Use today for current games, yesterday for last night results.',
        'required': True,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            date = args.get('date', datetime.now(ZoneInfo('America/Chicago')).strftime('%Y%m%d'))
            url = f'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date}'
            req = urllib.request.Request(url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
            if not data.get('events'):
                return json.dumps({'result': f'No NBA games found for {date}'})
            games = []
            for event in data['events']:
                comps = event.get('competitions', [{}])[0].get('competitors', [])
                if len(comps) >= 2:
                    away = next((c for c in comps if c.get('homeAway') == 'away'), comps[0])
                    home = next((c for c in comps if c.get('homeAway') == 'home'), comps[1])
                    status = event.get('status', {}).get('type', {}).get('description', 'Final')
                    games.append({
                        'away_team': away['team']['displayName'],
                        'away_score': away.get('score', '0'),
                        'home_team': home['team']['displayName'],
                        'home_score': home.get('score', '0'),
                        'status': status,
                    })
            return json.dumps({'games': games, 'count': len(games), 'date': date}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 3: GET NFL SCORES
# ═══════════════════════════════════════════════════════

@register_tool('get_nfl_scores')
class GetNFLScores(BaseTool):
    description = 'Get NFL football game scores and results. Use for questions about football games, NFL scores, who won in football.'
    parameters = [{
        'name': 'date',
        'type': 'string',
        'description': 'Date in YYYYMMDD format. Use today for current games.',
        'required': True,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            date = args.get('date', datetime.now(ZoneInfo('America/Chicago')).strftime('%Y%m%d'))
            url = f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={date}'
            req = urllib.request.Request(url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
            if not data.get('events'):
                return json.dumps({'result': f'No NFL games found for {date}'})
            games = []
            for event in data['events']:
                comps = event.get('competitions', [{}])[0].get('competitors', [])
                if len(comps) >= 2:
                    away = next((c for c in comps if c.get('homeAway') == 'away'), comps[0])
                    home = next((c for c in comps if c.get('homeAway') == 'home'), comps[1])
                    status = event.get('status', {}).get('type', {}).get('description', 'Final')
                    games.append({
                        'away_team': away['team']['displayName'],
                        'away_score': away.get('score', '0'),
                        'home_team': home['team']['displayName'],
                        'home_score': home.get('score', '0'),
                        'status': status,
                    })
            return json.dumps({'games': games, 'count': len(games), 'date': date}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 4: GET MLB SCORES
# ═══════════════════════════════════════════════════════

@register_tool('get_mlb_scores')
class GetMLBScores(BaseTool):
    description = 'Get MLB baseball game scores and results. Use for questions about baseball games, MLB scores, who won in baseball.'
    parameters = [{
        'name': 'date',
        'type': 'string',
        'description': 'Date in YYYYMMDD format. Use today for current games, yesterday for last night results.',
        'required': True,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            date = args.get('date', datetime.now(ZoneInfo('America/Chicago')).strftime('%Y%m%d'))
            url = f'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates={date}'
            req = urllib.request.Request(url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
            if not data.get('events'):
                return json.dumps({'result': f'No MLB games found for {date}'})
            games = []
            for event in data['events']:
                comps = event.get('competitions', [{}])[0].get('competitors', [])
                if len(comps) >= 2:
                    away = next((c for c in comps if c.get('homeAway') == 'away'), comps[0])
                    home = next((c for c in comps if c.get('homeAway') == 'home'), comps[1])
                    status = event.get('status', {}).get('type', {}).get('description', 'Final')
                    games.append({
                        'away_team': away['team']['displayName'],
                        'away_score': away.get('score', '0'),
                        'home_team': home['team']['displayName'],
                        'home_score': home.get('score', '0'),
                        'status': status,
                    })
            return json.dumps({'games': games, 'count': len(games), 'date': date}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 5: GET WEATHER
# ═══════════════════════════════════════════════════════

@register_tool('get_weather')
class GetWeather(BaseTool):
    description = 'Get current weather conditions for any city. Returns temperature, humidity, wind speed, and conditions.'
    parameters = [{
        'name': 'city',
        'type': 'string',
        'description': 'City name, e.g. "Oklahoma City", "Los Angeles", "New York"',
        'required': True,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            city = args.get('city', '')

            # Step 1: Geocode city name to lat/lon
            geo_url = f'https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(city)}&count=1'
            req = urllib.request.Request(geo_url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                geo = json.loads(resp.read().decode())

            if not geo.get('results'):
                return json.dumps({'error': f'City not found: {city}'})

            loc = geo['results'][0]
            lat, lon = loc['latitude'], loc['longitude']
            name = loc.get('name', city)
            admin = loc.get('admin1', '')
            country = loc.get('country', '')

            # Step 2: Get weather
            wx_url = (
                f'https://api.open-meteo.com/v1/forecast?'
                f'latitude={lat}&longitude={lon}'
                f'&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature'
                f'&temperature_unit=fahrenheit&wind_speed_unit=mph'
            )
            req = urllib.request.Request(wx_url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                wx = json.loads(resp.read().decode())

            current = wx.get('current', {})

            WMO_CODES = {
                0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
                45: 'Foggy', 48: 'Depositing rime fog',
                51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
                61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
                71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
                80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
                85: 'Slight snow showers', 86: 'Heavy snow showers',
                95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
            }

            weather_code = current.get('weather_code', 0)
            condition = WMO_CODES.get(weather_code, f'Code {weather_code}')
            location_str = ', '.join(filter(None, [name, admin, country]))

            return json.dumps({
                'location': location_str,
                'temperature_f': current.get('temperature_2m'),
                'feels_like_f': current.get('apparent_temperature'),
                'humidity_pct': current.get('relative_humidity_2m'),
                'wind_mph': current.get('wind_speed_10m'),
                'condition': condition,
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 6: GET CURRENT TIME
# ═══════════════════════════════════════════════════════

@register_tool('get_current_time')
class GetCurrentTime(BaseTool):
    description = 'Get the current date and time in any timezone. Use for questions about what time it is somewhere.'
    parameters = [{
        'name': 'timezone',
        'type': 'string',
        'description': 'Timezone name like "America/Chicago", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"',
        'required': True,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            tz_name = args.get('timezone', 'America/Chicago')
            tz = ZoneInfo(tz_name)
            now = datetime.now(tz)

            return json.dumps({
                'timezone': tz_name,
                'date': now.strftime('%A, %B %d, %Y'),
                'time': now.strftime('%I:%M %p'),
                'time_24h': now.strftime('%H:%M'),
                'iso': now.isoformat(),
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 7: GET CRYPTO PRICES
# ═══════════════════════════════════════════════════════

@register_tool('get_crypto_prices')
class GetCryptoPrices(BaseTool):
    description = 'Get current cryptocurrency prices. Returns price in USD, 24h change, market cap for top coins or a specific coin.'
    parameters = [{
        'name': 'coin',
        'type': 'string',
        'description': 'Coin ID like "bitcoin", "ethereum", "dogecoin", "solana". Use "top" for top 10 coins.',
        'required': False,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            coin = args.get('coin', 'top')

            # CoinGecko free API (no auth required)
            coin_map = {
                'btc': 'bitcoin', 'eth': 'ethereum', 'doge': 'dogecoin',
                'sol': 'solana', 'xrp': 'ripple', 'ada': 'cardano',
                'bnb': 'binancecoin', 'dot': 'polkadot', 'avax': 'avalanche-2',
                'matic': 'matic-network', 'link': 'chainlink', 'shib': 'shiba-inu',
            }

            if coin and coin.lower() != 'top':
                coin_id = coin_map.get(coin.lower(), coin.lower())
                ids = coin_id
            else:
                ids = 'bitcoin,ethereum,binancecoin,solana,ripple,cardano,dogecoin,polkadot,chainlink,avalanche-2'

            url = f'https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'
            req = urllib.request.Request(url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())

            results = []
            for coin_id, info in data.items():
                price = info.get('usd', 0)
                change = info.get('usd_24h_change', 0)
                mcap = info.get('usd_market_cap', 0)
                results.append({
                    'name': coin_id.replace('-', ' ').title(),
                    'price_usd': f'${price:,.2f}',
                    'change_24h': f'{change:+.2f}%' if change else 'N/A',
                    'market_cap_usd': f'${mcap:,.0f}' if mcap else 'N/A',
                })

            return json.dumps({'coins': results, 'count': len(results)}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# TOOL 8: GET NEWS HEADLINES
# ═══════════════════════════════════════════════════════

@register_tool('get_news_headlines')
class GetNewsHeadlines(BaseTool):
    description = 'Get the latest news headlines. Returns top news stories.'
    parameters = [{
        'name': 'topic',
        'type': 'string',
        'description': 'News topic: "general", "world", "technology", "science", "sports". Default is "general".',
        'required': False,
    }]

    def call(self, params, **kwargs):
        try:
            args = json.loads(params) if isinstance(params, str) else params
            topic = args.get('topic', 'general')

            # RSS feeds by topic via rss2json (free, no auth needed)
            rss_map = {
                'general': 'https://news.google.com/rss',
                'world': 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
                'technology': 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
                'science': 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
                'sports': 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
            }
            rss_url = rss_map.get(topic.lower(), rss_map['general'])
            encoded_rss = urllib.parse.quote(rss_url, safe='')
            url = f'https://api.rss2json.com/v1/api.json?rss_url={encoded_rss}'

            req = urllib.request.Request(url, headers={'User-Agent': 'SpaceBot/1.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())

            items = data.get('items', [])
            headlines = []
            for item in items[:10]:
                headlines.append({
                    'title': item.get('title', ''),
                    'source': item.get('author', '') or data.get('feed', {}).get('title', ''),
                    'published': item.get('pubDate', ''),
                })

            return json.dumps({
                'headlines': headlines,
                'topic': topic,
                'count': len(headlines),
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({'error': str(e)})


# ═══════════════════════════════════════════════════════
# LLM CONFIGURATION — Cerebras + QWEN 3
# ═══════════════════════════════════════════════════════

llm_cfg = {
    'model': os.environ.get('QWEN_MODEL', 'qwen-3-235b-a22b-instruct-2507'),
    'model_server': os.environ.get('CEREBRAS_BASE_URL', 'https://api.cerebras.ai/v1'),
    'api_key': os.environ.get('CEREBRAS_API_KEY', ''),
    'generate_cfg': {
        'max_input_tokens': 30000,
    },
}

# Tool names for function_list
TOOLS = [
    'get_nhl_scores',
    'get_nba_scores',
    'get_nfl_scores',
    'get_mlb_scores',
    'get_weather',
    'get_current_time',
    'get_crypto_prices',
    'get_news_headlines',
]


# ═══════════════════════════════════════════════════════
# HTTP SERVER
# ═══════════════════════════════════════════════════════

class ToolHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length))

            question = body.get('question', '')
            bot_prompt = body.get('bot_prompt', 'You are a helpful AI assistant.')

            if not question:
                self._respond(400, {'error': 'Missing question'})
                return

            # Create assistant with bot personality and tools
            bot = Assistant(
                llm=llm_cfg,
                system_message=bot_prompt,
                function_list=TOOLS,
            )

            # Run the agent — Qwen-Agent handles tool selection, execution, and response
            messages = [{'role': 'user', 'content': question}]
            response = []
            for response in bot.run(messages=messages):
                pass

            # Extract final assistant text
            final_text = ''
            for msg in response:
                if msg.get('role') == 'assistant' and isinstance(msg.get('content'), str):
                    final_text = msg['content']

            self._respond(200, {'answer': final_text})

        except BrokenPipeError:
            pass  # Client disconnected, nothing to do
        except Exception as e:
            import traceback
            traceback.print_exc()
            try:
                self._respond(500, {'error': str(e)})
            except BrokenPipeError:
                pass

    def _respond(self, code, body):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, format, *args):
        pass


# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════

if __name__ == '__main__':
    port = int(os.environ.get('TOOL_SERVICE_PORT', 3456))
    server = HTTPServer(('127.0.0.1', port), ToolHandler)
    print(f'LUCY Tool Service running on port {port}', flush=True)
    print(f'Model: {llm_cfg["model"]}', flush=True)
    print(f'Server: {llm_cfg["model_server"]}', flush=True)
    print(f'Tools: {len(TOOLS)} registered', flush=True)
    server.serve_forever()
