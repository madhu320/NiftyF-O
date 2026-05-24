const NSE_BASE_URL = 'https://www.nseindia.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export class NseApi {
  private cookie: string = '';

  // NSE API requires valid session cookies. We fetch them by visiting the homepage first.
  private async fetchCookies() {
    try {
      const response = await fetch(NSE_BASE_URL, { headers: HEADERS });
      
      // Extract cookies from the response headers (Node 18+ Fetch API supports getSetCookie)
      const setCookieHeaders = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      
      if (setCookieHeaders.length > 0) {
        this.cookie = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
      }
    } catch (error) {
      console.error('Failed to fetch NSE cookies:', error);
    }
  }

  async getOptionsChain(symbol: string = 'BANKNIFTY') {
    if (!this.cookie) {
      await this.fetchCookies();
    }

    try {
      let response = await fetch(`${NSE_BASE_URL}/api/option-chain-indices?symbol=${symbol}`, {
        headers: { ...HEADERS, 'Cookie': this.cookie },
      });

      // If unauthorized or forbidden, the cookie probably expired. Refresh and retry.
      if (response.status === 401 || response.status === 403) {
        console.log('Refreshing NSE cookies...');
        await this.fetchCookies();
        
        response = await fetch(`${NSE_BASE_URL}/api/option-chain-indices?symbol=${symbol}`, {
          headers: { ...HEADERS, 'Cookie': this.cookie },
        });
      }

      if (!response.ok) {
        throw new Error(`NSE API returned status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch options chain from NSE:', error);
      throw error;
    }
  }
}