import {
  ContentProcessor,
  Draft,
  OutputFormat,
  ErrorCode,
  InkedError,
} from '../types.js';

export class MarkdownProcessor implements ContentProcessor {
  async formatContent(drafts: Draft[], format: OutputFormat): Promise<string> {
    if (format !== 'md') {
      throw new InkedError(
        'Invalid format for MarkdownProcessor',
        ErrorCode.INVALID_REQUEST
      );
    }

    try {
      const sections: string[] = [];

      // Sort drafts by type and version
      const sortedDrafts = [...drafts].sort((a, b) => {
        // First by type priority
        const typePriority = {
          chapter: 1,
          section: 2,
          report: 3,
        };
        const typeCompare = 
          typePriority[a.metadata.type] - typePriority[b.metadata.type];
        if (typeCompare !== 0) return typeCompare;

        // Then by version
        return a.metadata.version - b.metadata.version;
      });

      // Process each draft
      for (const draft of sortedDrafts) {
        // Add header based on type
        switch (draft.metadata.type) {
          case 'chapter':
            sections.push(`# ${draft.id}\n`);
            break;
          case 'section':
            sections.push(`## ${draft.id}\n`);
            break;
          case 'report':
            sections.push(`### ${draft.id}\n`);
            break;
        }

        // Add metadata as YAML frontmatter
        sections.push('---');
        sections.push(`type: ${draft.metadata.type}`);
        sections.push(`version: ${draft.metadata.version}`);
        sections.push(`created: ${draft.metadata.created_at.toISOString()}`);
        sections.push(`updated: ${draft.metadata.updated_at.toISOString()}`);
        if (draft.metadata.parent_id) {
          sections.push(`parent: ${draft.metadata.parent_id}`);
        }
        if (draft.metadata.tags && draft.metadata.tags.length > 0) {
          sections.push(`tags: [${draft.metadata.tags.join(', ')}]`);
        }
        sections.push('---\n');

        // Add content
        sections.push(draft.content);
        sections.push('\n---\n');
      }

      return sections.join('\n');
    } catch (error) {
      throw new InkedError(
        'Failed to format content as Markdown',
        ErrorCode.PROCESSING_ERROR,
        error
      );
    }
  }

  async generateTableOfContents(drafts: Draft[]): Promise<string> {
    try {
      const toc: string[] = ['# Table of Contents\n'];
      const sortedDrafts = [...drafts].sort((a, b) => {
        const typePriority = {
          chapter: 1,
          section: 2,
          report: 3,
        };
        return (
          typePriority[a.metadata.type] - typePriority[b.metadata.type] ||
          a.metadata.version - b.metadata.version
        );
      });

      // Group by type
      const grouped = new Map<string, Draft[]>();
      for (const draft of sortedDrafts) {
        const type = draft.metadata.type;
        if (!grouped.has(type)) {
          grouped.set(type, []);
        }
        grouped.get(type)!.push(draft);
      }

      // Generate TOC entries
      for (const type of ['chapter', 'section', 'report']) {
        const drafts = grouped.get(type);
        if (drafts && drafts.length > 0) {
          toc.push(`\n## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`);
          for (const draft of drafts) {
            const indent = type === 'chapter' ? '' : '  ';
            toc.push(`${indent}- ${draft.id}`);
            if (draft.metadata.tags && draft.metadata.tags.length > 0) {
              toc.push(` _(${draft.metadata.tags.join(', ')})_`);
            }
            toc.push('\n');
          }
        }
      }

      return toc.join('');
    } catch (error) {
      throw new InkedError(
        'Failed to generate table of contents',
        ErrorCode.PROCESSING_ERROR,
        error
      );
    }
  }

  async validateContent(draft: Draft): Promise<boolean> {
    // Basic markdown validation
    try {
      // Check for balanced markdown elements
      const content = draft.content;
      
      // Check code blocks
      const codeBlocks = (content.match(/```/g) || []).length;
      if (codeBlocks % 2 !== 0) {
        throw new Error('Unmatched code blocks');
      }

      // Check link syntax
      const links = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
      for (const link of links) {
        if (!link.match(/\[([^\]]+)\]\(([^)]+)\)/)) {
          throw new Error('Invalid link syntax');
        }
      }

      // Check image syntax
      const images = content.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
      for (const image of images) {
        if (!image.match(/!\[([^\]]*)\]\(([^)]+)\)/)) {
          throw new Error('Invalid image syntax');
        }
      }

      return true;
    } catch (error) {
      throw new InkedError(
        'Content validation failed',
        ErrorCode.PROCESSING_ERROR,
        error
      );
    }
  }
}
