export interface SearchResult {
  id: number;
  content: string;
  created_at: string;
  relevanceScore: number;
  matchType: string;
}

export interface SemanticMatcher {
  searchMemories(query: string, limit?: number): Promise<SearchResult[]>;
}

class FastSemanticSearch implements SemanticMatcher {
  // Common word variations and synonyms for better matching
  private readonly synonyms: Map<string, string[]> = new Map([
    ['preferences', ['settings', 'config', 'options', 'choices']],
    ['settings', ['preferences', 'config', 'options', 'configuration']],
    ['project', ['work', 'task', 'assignment', 'job']],
    ['user', ['person', 'client', 'individual']],
    ['likes', ['enjoys', 'prefers', 'loves', 'favors']],
    ['dislikes', ['hates', 'avoids', 'rejects', 'opposes']],
    ['wants', ['needs', 'requires', 'desires', 'seeks']],
    ['important', ['crucial', 'vital', 'essential', 'critical']],
    ['problem', ['issue', 'bug', 'error', 'trouble']],
    ['solution', ['fix', 'answer', 'resolution', 'remedy']],
    ['fast', ['quick', 'rapid', 'speedy', 'swift']],
    ['slow', ['sluggish', 'delayed', 'gradual']],
    ['good', ['great', 'excellent', 'positive', 'beneficial']],
    ['bad', ['poor', 'negative', 'terrible', 'awful']],
  ]);

  // Stop words to filter out for better matching
  private readonly stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
    'had', 'what', 'said', 'each', 'which', 'do', 'how', 'their', 'if',
    'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her',
    'would', 'make', 'like', 'into', 'him', 'time', 'two', 'more',
    'go', 'no', 'way', 'could', 'my', 'than', 'first', 'been', 'call',
    'who', 'oil', 'sit', 'now', 'find', 'down', 'day', 'did', 'get',
    'may', 'new', 'try', 'came', 'show', 'every', 'should', 'thought'
  ]);

  constructor(private db: any) {}

  async searchMemories(query: string, limit: number = 3): Promise<SearchResult[]> {
    // Handle "ALL" special case
    if (query.toUpperCase() === 'ALL') {
      return this.getAllMemories(limit);
    }

    // Get all memories from database
    const allMemories = await this.getAllMemories(50); // Get more for better ranking
    
    if (allMemories.length === 0) {
      return [];
    }

    // Process query and calculate relevance scores
    const processedQuery = this.preprocessText(query);
    const scoredResults = allMemories.map(memory => ({
      ...memory,
      relevanceScore: this.calculateRelevanceScore(processedQuery, memory.content),
      matchType: this.getMatchType(processedQuery, memory.content)
    }));

    // Sort by relevance score and return top results
    return scoredResults
      .filter(result => result.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  private async getAllMemories(limit: number): Promise<SearchResult[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, content, created_at
        FROM memories
        ORDER BY created_at DESC
        LIMIT ?
      `;

      this.db.db.all(sql, [limit], (err: any, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const memories = rows.map(row => ({
          id: row.id,
          content: row.content,
          created_at: row.created_at,
          relevanceScore: 1.0,
          matchType: 'all'
        }));

        resolve(memories);
      });
    });
  }

  private preprocessText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word))
      .map(word => this.stemWord(word));
  }

  private stemWord(word: string): string {
    // Simple stemming - remove common suffixes
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'ness', 'ment'];
    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return word.slice(0, -suffix.length);
      }
    }
    return word;
  }

  private calculateRelevanceScore(queryTerms: string[], content: string): number {
    const contentTerms = this.preprocessText(content);
    const contentText = content.toLowerCase();
    let score = 0;

    for (const queryTerm of queryTerms) {
      // Exact term match (highest score)
      if (contentTerms.includes(queryTerm)) {
        score += 10;
        continue;
      }

      // Partial word match
      const partialMatch = contentTerms.find(term => 
        term.includes(queryTerm) || queryTerm.includes(term)
      );
      if (partialMatch) {
        score += 5;
        continue;
      }

      // Synonym match
      const synonymScore = this.getSynonymScore(queryTerm, contentTerms);
      if (synonymScore > 0) {
        score += synonymScore;
        continue;
      }

      // Fuzzy match (Levenshtein distance)
      const fuzzyScore = this.getFuzzyScore(queryTerm, contentTerms);
      if (fuzzyScore > 0) {
        score += fuzzyScore;
        continue;
      }

      // Phrase context match
      const contextScore = this.getContextScore(queryTerm, contentText);
      if (contextScore > 0) {
        score += contextScore;
      }
    }

    // Boost score for shorter content (more focused)
    const lengthBoost = Math.max(0, 1 - (content.length / 1000));
    score *= (1 + lengthBoost * 0.2);

    // Boost for multiple term matches
    const matchedTerms = queryTerms.filter(term => 
      contentTerms.includes(term) || 
      contentTerms.some(cTerm => cTerm.includes(term))
    );
    const multiTermBoost = matchedTerms.length > 1 ? matchedTerms.length * 0.5 : 0;
    score += multiTermBoost;

    return Math.round(score * 100) / 100;
  }

  private getSynonymScore(queryTerm: string, contentTerms: string[]): number {
    for (const [key, synonyms] of this.synonyms) {
      if (queryTerm === key || synonyms.includes(queryTerm)) {
        const relatedTerms = [key, ...synonyms];
        for (const contentTerm of contentTerms) {
          if (relatedTerms.includes(contentTerm)) {
            return 3; // Lower than exact match but still valuable
          }
        }
      }
    }
    return 0;
  }

  private getFuzzyScore(queryTerm: string, contentTerms: string[]): number {
    let bestScore = 0;
    for (const contentTerm of contentTerms) {
      const distance = this.levenshteinDistance(queryTerm, contentTerm);
      const maxLen = Math.max(queryTerm.length, contentTerm.length);
      const similarity = 1 - (distance / maxLen);
      
      // Only consider if similarity is high enough and terms are reasonably long
      if (similarity > 0.7 && maxLen > 3) {
        bestScore = Math.max(bestScore, similarity * 2);
      }
    }
    return bestScore;
  }

  private getContextScore(queryTerm: string, contentText: string): number {
    // Look for the query term in different contexts
    const contexts = [
      `${queryTerm} is`,
      `${queryTerm} are`,
      `the ${queryTerm}`,
      `of ${queryTerm}`,
      `${queryTerm} that`,
      `${queryTerm} which`,
    ];

    for (const context of contexts) {
      if (contentText.includes(context)) {
        return 1;
      }
    }
    return 0;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private getMatchType(queryTerms: string[], content: string): string {
    const contentTerms = this.preprocessText(content);
    
    // Check for exact matches
    const exactMatches = queryTerms.filter(term => contentTerms.includes(term));
    if (exactMatches.length === queryTerms.length) {
      return 'exact';
    } else if (exactMatches.length > 0) {
      return 'partial';
    }
    
    // Check for synonym matches
    for (const queryTerm of queryTerms) {
      if (this.getSynonymScore(queryTerm, contentTerms) > 0) {
        return 'semantic';
      }
    }
    
    // Check for fuzzy matches
    for (const queryTerm of queryTerms) {
      if (this.getFuzzyScore(queryTerm, contentTerms) > 0) {
        return 'fuzzy';
      }
    }
    
    return 'context';
  }
}

export { FastSemanticSearch };