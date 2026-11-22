import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Card } from '../design-system/Card';
import { Badge } from '../design-system/Badge';
import { useTheme } from '../design-system/ThemeContext';

export interface GuideData {
  id: string;
  node_id: string;
  markdown: string;
  status: 'draft' | 'approved';
  source_urls?: string[] | null;
  last_verified_at?: string | null;
}

export interface QuickstartGuideViewProps {
  nodeId: string;
  nodeName: string;
  userId?: string;
  externalUrl?: string | null;
  guide?: GuideData | null;
  isLoading?: boolean;
}

interface ParsedStep {
  stepNumber: number;
  title: string;
  estimatedMinutes?: number;
  instruction: string;
  codeSnippet?: string;
}

interface ParsedGuide {
  goal?: string;
  prerequisites: string[];
  steps: ParsedStep[];
  verification?: string;
  pitfalls: string[];
  sources: string[];
}

/**
 * Pure safe parser that extracts structured sections from guide markdown.
 * Avoids any raw HTML injection.
 */
function parseGuideMarkdown(markdown: string): ParsedGuide {
  const result: ParsedGuide = {
    prerequisites: [],
    steps: [],
    pitfalls: [],
    sources: [],
  };

  const lines = markdown.split('\n');
  let currentSection = '';
  let currentStep: ParsedStep | null = null;
  let inCodeBlock = false;
  let codeSnippetBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block boundaries
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        if (currentStep) {
          currentStep.codeSnippet = codeSnippetBuffer.trim();
        }
        inCodeBlock = false;
        codeSnippetBuffer = '';
      } else {
        inCodeBlock = true;
        codeSnippetBuffer = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeSnippetBuffer += line + '\n';
      continue;
    }

    // Section headers
    if (trimmed.startsWith('## Goal')) {
      currentSection = 'goal';
      continue;
    } else if (trimmed.startsWith('## Prerequisites')) {
      currentSection = 'prerequisites';
      continue;
    } else if (trimmed.startsWith('## Steps')) {
      currentSection = 'steps';
      continue;
    } else if (trimmed.startsWith('## Verify it worked')) {
      currentSection = 'verification';
      continue;
    } else if (trimmed.startsWith('## Common Pitfalls')) {
      currentSection = 'pitfalls';
      continue;
    } else if (trimmed.startsWith('## Source')) {
      currentSection = 'sources';
      continue;
    }

    // Sub-header for Step
    const stepHeaderMatch = trimmed.match(/^### Step\s+(\d+):\s*(.*?)(?:\s*\(~(\d+)\s*min\))?$/i);
    if (stepHeaderMatch) {
      if (currentStep) {
        result.steps.push(currentStep);
      }
      currentStep = {
        stepNumber: parseInt(stepHeaderMatch[1], 10),
        title: stepHeaderMatch[2],
        estimatedMinutes: stepHeaderMatch[3] ? parseInt(stepHeaderMatch[3], 10) : undefined,
        instruction: '',
      };
      currentSection = 'step_body';
      continue;
    }

    // Section content accumulation
    if (currentSection === 'goal') {
      if (trimmed && !result.goal) {
        result.goal = trimmed;
      }
    } else if (currentSection === 'prerequisites') {
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        result.prerequisites.push(trimmed.replace(/^[-*]\s*/, ''));
      }
    } else if (currentSection === 'step_body' && currentStep) {
      if (trimmed) {
        currentStep.instruction = currentStep.instruction
          ? `${currentStep.instruction}\n${trimmed}`
          : trimmed;
      }
    } else if (currentSection === 'verification') {
      if (trimmed) {
        result.verification = result.verification
          ? `${result.verification}\n${trimmed}`
          : trimmed;
      }
    } else if (currentSection === 'pitfalls') {
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        result.pitfalls.push(trimmed.replace(/^[-*]\s*/, ''));
      }
    } else if (currentSection === 'sources') {
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const linkMatch = trimmed.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          result.sources.push(linkMatch[2]);
        } else {
          result.sources.push(trimmed.replace(/^[-*]\s*/, ''));
        }
      }
    }
  }

  if (currentStep) {
    result.steps.push(currentStep);
  }

  return result;
}

export const QuickstartGuideView: React.FC<QuickstartGuideViewProps> = ({
  nodeId,
  nodeName,
  userId = 'default_user',
  externalUrl,
  guide,
  isLoading,
}) => {
  const { theme, spacing, radii, typography } = useTheme();

  // Checkable steps saved locally per user (PRD 10.4)
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    function loadCheckedSteps() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const key = `@atlas:guide_progress:${userId}:${nodeId}`;
          const stored = window.localStorage.getItem(key);
          if (stored && isMounted) {
            setCheckedSteps(JSON.parse(stored));
          }
        }
      } catch {
        // ignore storage read failure
      }
    }
    loadCheckedSteps();
    return () => {
      isMounted = false;
    };
  }, [userId, nodeId]);

  const toggleStep = (stepNumber: number) => {
    const updated = {
      ...checkedSteps,
      [stepNumber]: !checkedSteps[stepNumber],
    };
    setCheckedSteps(updated);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `@atlas:guide_progress:${userId}:${nodeId}`;
        window.localStorage.setItem(key, JSON.stringify(updated));
      }
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading quickstart guide...
        </Text>
      </View>
    );
  }

  // PRD Section 10.4: App shows guide ONLY when status = approved
  // Otherwise show "Guide in review" and the official docs link.
  const isApproved = guide && guide.status === 'approved';

  if (!isApproved) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.surfaceSubtle,
            borderColor: theme.border,
            borderRadius: radii.md,
          },
        ]}
        testID="guide-in-review-state"
      >
        <View style={styles.reviewHeaderRow}>
          <Text style={[styles.guideTitle, { color: theme.text }]}>
            📖 20-Minute Quickstart Guide
          </Text>
          <Badge label="In Review" variant="outline" />
        </View>

        <Text style={[styles.reviewNoticeText, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
          Our editorial team is currently reviewing and verifying the interactive step-by-step instructions for this skill.
        </Text>

        {externalUrl ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(externalUrl)}
            style={[styles.docsLinkButton, { borderColor: theme.border, borderRadius: radii.sm }]}
            testID="official-docs-link"
          >
            <Text style={[styles.docsLinkText, { color: theme.primary }]}>
              View Official Documentation ↗
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // Approved Guide Render
  const parsed = parseGuideMarkdown(guide.markdown);
  const formattedVerifiedDate = guide.last_verified_at
    ? new Date(guide.last_verified_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Recently';

  return (
    <View
      style={[
        styles.approvedContainer,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderRadius: radii.md,
        },
      ]}
      testID="approved-guide-container"
    >
      {/* Header & Verification Date Label */}
      <View style={styles.approvedHeaderRow}>
        <View>
          <Text style={[styles.guideTitle, { color: theme.text }]}>
            📖 20-Minute Quickstart Guide
          </Text>
          <Text
            style={[styles.lastVerifiedLabel, { color: theme.textSecondary }]}
            testID="guide-last-verified-label"
          >
            ✓ Last verified: {formattedVerifiedDate}
          </Text>
        </View>
        <Badge label="Approved" variant="primary" />
      </View>

      {/* 1. Goal (1 line) */}
      {parsed.goal && (
        <Card style={styles.goalCard} testID="guide-goal">
          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            GOAL
          </Text>
          <Text style={[styles.goalText, { color: theme.text, ...typography.sm }]}>
            {parsed.goal}
          </Text>
        </Card>
      )}

      {/* 2. Prerequisites */}
      {parsed.prerequisites.length > 0 && (
        <View style={styles.sectionBlock} testID="guide-prerequisites">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Prerequisites
          </Text>
          {parsed.prerequisites.map((p, idx) => (
            <Text key={idx} style={[styles.bulletItem, { color: theme.textSecondary }]}>
              • {p}
            </Text>
          ))}
        </View>
      )}

      {/* 3. Checkable Steps */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Step-by-Step Instructions
        </Text>
        <Text style={[styles.sectionInstructionNote, { color: theme.textSecondary }]}>
          Tap each step as you complete it. Progress is saved locally.
        </Text>

        <View style={styles.stepList}>
          {parsed.steps.map((step) => {
            const isChecked = Boolean(checkedSteps[step.stepNumber]);
            return (
              <View
                key={step.stepNumber}
                style={[
                  styles.stepCard,
                  {
                    backgroundColor: isChecked ? 'rgba(22, 163, 74, 0.05)' : theme.surfaceSubtle,
                    borderColor: isChecked ? '#16a34a' : theme.border,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.stepHeaderTouchable}
                  onPress={() => toggleStep(step.stepNumber)}
                  testID={`guide-step-checkbox-${step.stepNumber}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: isChecked ? '#16a34a' : 'transparent',
                        borderColor: isChecked ? '#16a34a' : theme.textSecondary,
                        borderRadius: 4,
                      },
                    ]}
                  >
                    {isChecked ? <Text style={styles.checkIcon}>✓</Text> : null}
                  </View>
                  <Text
                    style={[
                      styles.stepCardTitle,
                      {
                        color: theme.text,
                        textDecorationLine: isChecked ? 'line-through' : 'none',
                        flex: 1,
                      },
                    ]}
                  >
                    Step {step.stepNumber}: {step.title}{' '}
                    {step.estimatedMinutes ? `(~${step.estimatedMinutes} min)` : ''}
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.stepInstruction, { color: theme.textSecondary }]}>
                  {step.instruction}
                </Text>

                {step.codeSnippet ? (
                  <View
                    style={[
                      styles.codeSnippetContainer,
                      {
                        backgroundColor: '#1e293b',
                        borderRadius: radii.sm,
                      },
                    ]}
                    testID={`guide-code-snippet-${step.stepNumber}`}
                  >
                    <Text style={styles.codeText}>{step.codeSnippet}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* 4. Verification */}
      {parsed.verification && (
        <View style={styles.sectionBlock} testID="guide-verification">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Verify It Worked
          </Text>
          <Text style={[styles.verificationText, { color: theme.textSecondary }]}>
            {parsed.verification}
          </Text>
        </View>
      )}

      {/* 5. Common Pitfalls */}
      {parsed.pitfalls.length > 0 && (
        <View style={styles.sectionBlock} testID="guide-pitfalls">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Common Pitfalls
          </Text>
          {parsed.pitfalls.map((pitfall, idx) => (
            <Text key={idx} style={[styles.bulletItem, { color: theme.textSecondary }]}>
              ⚠️ {pitfall}
            </Text>
          ))}
        </View>
      )}

      {/* 6. Official Sources */}
      {(parsed.sources.length > 0 || externalUrl) && (
        <View style={styles.sectionBlock} testID="guide-sources">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Official Documentation
          </Text>
          {Array.from(new Set([externalUrl, ...parsed.sources].filter(Boolean))).map((src, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => Linking.openURL(src!)}
              style={styles.sourceLinkTouchable}
            >
              <Text style={[styles.sourceLinkText, { color: theme.primary }]}>
                🔗 {src} ↗
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderWidth: 1,
    marginTop: 16,
  },
  approvedContainer: {
    padding: 16,
    borderWidth: 1,
    marginTop: 16,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  approvedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  lastVerifiedLabel: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  reviewNoticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  docsLinkButton: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  docsLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  goalCard: {
    marginBottom: 16,
    padding: 12,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  goalText: {
    fontWeight: '600',
    lineHeight: 20,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionInstructionNote: {
    fontSize: 12,
    marginBottom: 10,
  },
  bulletItem: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  stepList: {
    gap: 10,
  },
  stepCard: {
    padding: 12,
    borderWidth: 1,
  },
  stepHeaderTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  stepCardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepInstruction: {
    fontSize: 13,
    lineHeight: 18,
  },
  codeSnippetContainer: {
    padding: 10,
    marginTop: 8,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#38bdf8',
  },
  verificationText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sourceLinkTouchable: {
    paddingVertical: 4,
  },
  sourceLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
