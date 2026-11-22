import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, Card, Button, Badge, Input, useTheme } from '../src/design-system';
import { useAuth } from '../src/lib/AuthProvider';
import { useAuthStore } from '../src/lib/authStore';
import { supabase } from '../src/lib/supabase';
import { useRealtimeSync, broadcastSyncEvent } from '../src/lib/realtimeSync';
import { OfflineBanner } from '../src/components/OfflineBanner';
import {
  getBundledCanonicalGraph,
  updateRoadmapStackAndLevels,
} from '../src/lib/roadmapService';
import { CANONICAL_AREAS } from '../src/lib/onboardingStore';
import type { CanonicalNode, LevelsByArea, UserNode } from '@repo/schemas';

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme, spacing, typography } = useTheme();
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = user?.id || '00000000-0000-0000-0000-000000000099';

  const { isOnline } = useRealtimeSync(userId);

  // 1. Edit Display Name State
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaveSuccess, setNameSaveSuccess] = useState(false);

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
  }, [profile?.display_name]);

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) return;
    setIsSavingName(true);
    setNameSaveSuccess(false);

    try {
      // 1. Persist to Supabase
      await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      // 2. Mock session storage fallback
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem('__mock_auth__');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.profile) {
            parsed.profile.display_name = displayName.trim();
            window.sessionStorage.setItem('__mock_auth__', JSON.stringify(parsed));
          }
        }
      }

      // 3. Update local auth state
      if (profile) {
        useAuthStore.getState().setProfile({
          ...profile,
          display_name: displayName.trim(),
        });
      }

      // 4. Broadcast change to other open browser sessions
      broadcastSyncEvent({
        type: 'PROFILE_UPDATED',
        userId,
        payload: { display_name: displayName.trim() },
      });

      setNameSaveSuccess(true);
      setTimeout(() => setNameSaveSuccess(false), 3000);
    } catch {
      // ignore
    } finally {
      setIsSavingName(false);
    }
  };

  // 2. Edit Known Stack & Levels State (PRD Section 11.5)
  const [showStackEditor, setShowStackEditor] = useState(false);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [levelsByArea, setLevelsByArea] = useState<LevelsByArea>({
    'editors-ides': 'working',
    'ai-assistants': 'working',
    'languages-frameworks': 'working',
    testing: 'beginner',
    deployment: 'beginner',
    'agents-automation': 'beginner',
  });
  const [allCanonicalNodes, setAllCanonicalNodes] = useState<CanonicalNode[]>([]);
  const [isUpdatingRoadmap, setIsUpdatingRoadmap] = useState(false);
  const [roadmapUpdateSuccess, setRoadmapUpdateSuccess] = useState(false);

  // Initialize stack & levels from current roadmap and profile
  useEffect(() => {
    const graph = getBundledCanonicalGraph();
    setAllCanonicalNodes(graph.nodes);

    if (profile?.experience && typeof profile.experience === 'object') {
      setLevelsByArea((prev) => ({
        ...prev,
        ...(profile.experience as LevelsByArea),
      }));
    }

    // Load current known tools from session or DB
    let currentNodes: UserNode[] = [];
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const raw = window.sessionStorage.getItem('__atlas_user_nodes__');
        if (raw) currentNodes = JSON.parse(raw);
      } catch {
        // ignore
      }
    }
    const knownSet = new Set<string>();
    for (const un of currentNodes) {
      if (un.status === 'known' || un.status === 'completed') {
        knownSet.add(un.node_id);
      }
    }
    setSelectedTools(knownSet);
  }, [profile?.experience]);

  const toggleToolSelection = (nodeId: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleUpdateStackAndLevels = async () => {
    setIsUpdatingRoadmap(true);
    setRoadmapUpdateSuccess(false);

    try {
      await updateRoadmapStackAndLevels(Array.from(selectedTools), levelsByArea);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', userId] });
      setRoadmapUpdateSuccess(true);
      setTimeout(() => setRoadmapUpdateSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to update stack and levels:', err);
    } finally {
      setIsUpdatingRoadmap(false);
    }
  };

  // 3. Notification Preferences (PRD Section 11.5 - store only)
  const [notifVerdicts, setNotifVerdicts] = useState(true);
  const [notifDigest, setNotifDigest] = useState(true);
  const [notifUnlocks, setNotifUnlocks] = useState(false);

  // 4. Data Export & Delete Account (PRD Section 14)
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportData = () => {
    let userNodes: unknown[] = [];
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const raw = window.sessionStorage.getItem('__atlas_user_nodes__');
        if (raw) userNodes = JSON.parse(raw);
      } catch {
        // ignore
      }
    }
    const exportPayload = {
      user: {
        id: user?.id,
        email: user?.email,
      },
      profile,
      roadmap_nodes: userNodes,
      exported_at: new Date().toISOString(),
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atlas-learning-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('Data exported successfully as JSON.');
    } else {
      setExportNotice('Export complete. Your data has been generated.');
    }
    setTimeout(() => setExportNotice(null), 3000);
  };

  const handleDeleteAccount = async () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Are you sure you want to delete your Atlas.AI account and learning data? This action cannot be undone.',
      );
      if (confirmed) {
        try {
          await supabase.from('profiles').delete().eq('id', userId);
        } catch {
          // ignore
        }
        await signOut();
        router.replace('/(auth)/sign-in');
      }
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <Screen scrollable contentContainerStyle={styles.container}>
      <OfflineBanner isOnline={isOnline} />

      <Card style={styles.card}>
        {/* User Identity Header */}
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>
              {(displayName || user?.email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.userMeta}>
            <Text
              testID="profile-display-name-text"
              style={[styles.displayName, { color: theme.text, ...typography.lg }]}
            >
              {displayName || 'Anonymous Learner'}
            </Text>
            <Text style={[styles.email, { color: theme.textSecondary }]}>
              {user?.email || 'test-user@atlas.local'}
            </Text>
          </View>
        </View>

        {/* Learning Profile Metadata */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>LEARNING PROFILE</Text>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Launch Domain</Text>
            <Badge label="AI-Assisted Software Dev" variant="primary" />
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Onboarding Status</Text>
            <Badge
              label={profile?.onboarding_completed ? 'Completed' : 'Pending'}
              variant={profile?.onboarding_completed ? 'success' : 'warning'}
            />
          </View>
        </View>

        {/* 1. Edit Display Name Section */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>ACCOUNT IDENTITY</Text>
          <View style={styles.nameEditRow}>
            <View style={styles.inputWrapper}>
              <Input
                testID="profile-display-name-input"
                placeholder="Enter display name"
                value={displayName}
                onChangeText={setDisplayName}
              />
            </View>
            <Button
              testID="profile-save-name-button"
              title={isSavingName ? 'Saving...' : 'Save Name'}
              size="sm"
              onPress={handleSaveDisplayName}
              disabled={isSavingName || !displayName.trim()}
              style={styles.saveNameButton}
            />
          </View>
          {nameSaveSuccess ? (
            <Text
              testID="profile-name-saved"
              style={[styles.successText, { color: theme.success }]}
            >
              ✓ Display name updated
            </Text>
          ) : null}
        </View>

        {/* 2. Known Stack & Experience Levels Section (PRD Section 11.5) */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                EXPERIENCE & STACK
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                Re-run baseline merge without losing completed skills
              </Text>
            </View>
            <Button
              testID="edit-stack-button"
              title={showStackEditor ? 'Close' : 'Edit Stack'}
              variant="outline"
              size="sm"
              onPress={() => setShowStackEditor(!showStackEditor)}
            />
          </View>

          {roadmapUpdateSuccess ? (
            <View
              testID="stack-update-success"
              style={[styles.successBanner, { backgroundColor: theme.surfaceSubtle }]}
            >
              <Text style={[styles.successBannerText, { color: theme.success }]}>
                ✓ Roadmap updated! Completed skills and progress were safely preserved.
              </Text>
            </View>
          ) : null}

          {showStackEditor ? (
            <View style={[styles.stackEditorContainer, { backgroundColor: theme.surface }]}>
              <View style={styles.invariantNotice}>
                <Text style={styles.invariantIcon}>🛡️</Text>
                <Text style={[styles.invariantText, { color: theme.textSecondary }]}>
                  Invariant: Completed progress, in-progress items, and legacy replacements are
                  never deleted or overwritten.
                </Text>
              </View>

              {/* Area Levels & Tools */}
              {CANONICAL_AREAS.map((area) => {
                const areaNodes = allCanonicalNodes.filter((n) => n.area === area.slug);
                const currentLevel = levelsByArea[area.slug] || 'working';

                return (
                  <View
                    key={area.slug}
                    style={[styles.areaBlock, { borderBottomColor: theme.border }]}
                  >
                    <View style={styles.areaHeader}>
                      <Text style={styles.areaIcon}>{area.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.areaName, { color: theme.text }]}>
                          {area.name}
                        </Text>
                        <Text style={[styles.areaDesc, { color: theme.textMuted }]}>
                          {area.description}
                        </Text>
                      </View>
                    </View>

                    {/* Level Picker */}
                    <View style={styles.levelRow}>
                      <Text style={[styles.levelLabel, { color: theme.textSecondary }]}>
                        Target Level:
                      </Text>
                      <View style={styles.levelButtons}>
                        {(['beginner', 'working', 'expert'] as const).map((lvl) => (
                          <TouchableOpacity
                            key={lvl}
                            testID={`level-${area.slug}-${lvl}`}
                            onPress={() =>
                              setLevelsByArea((prev) => ({ ...prev, [area.slug]: lvl }))
                            }
                            style={[
                              styles.levelPill,
                              {
                                borderColor:
                                  currentLevel === lvl ? theme.primary : theme.border,
                                backgroundColor:
                                  currentLevel === lvl
                                    ? theme.surfaceSubtle
                                    : 'transparent',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.levelPillText,
                                {
                                  color:
                                    currentLevel === lvl
                                      ? theme.primary
                                      : theme.textSecondary,
                                  fontWeight: currentLevel === lvl ? '700' : '500',
                                },
                              ]}
                            >
                              {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Known Tools Toggle */}
                    <Text
                      style={[
                        styles.toolsLabel,
                        { color: theme.textSecondary, marginTop: 8 },
                      ]}
                    >
                      Tools you know:
                    </Text>
                    <View style={styles.toolPillsRow}>
                      {areaNodes.map((n) => {
                        const isSelected = selectedTools.has(n.id);
                        return (
                          <TouchableOpacity
                            key={n.id}
                            testID={`tool-toggle-${n.id}`}
                            onPress={() => toggleToolSelection(n.id)}
                            style={[
                              styles.toolPill,
                              {
                                borderColor: isSelected ? theme.primary : theme.border,
                                backgroundColor: isSelected
                                  ? theme.primary
                                  : theme.surface,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.toolPillText,
                                {
                                  color: isSelected ? '#FFFFFF' : theme.text,
                                  fontWeight: isSelected ? '600' : '400',
                                },
                              ]}
                            >
                              {isSelected ? '✓ ' : ''}
                              {n.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={styles.saveStackRow}>
                <Button
                  testID="save-stack-button"
                  title={isUpdatingRoadmap ? 'Merging Roadmap...' : 'Save & Update Roadmap'}
                  onPress={handleUpdateStackAndLevels}
                  disabled={isUpdatingRoadmap}
                />
              </View>
            </View>
          ) : null}
        </View>

        {/* 3. Notification Preferences (PRD Section 11.5) */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            NOTIFICATION PREFERENCES
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>
                AI Breakthrough Verdicts
              </Text>
              <Text style={[styles.rowSubLabel, { color: theme.textMuted }]}>
                Instant notifications when a verdict impacts your roadmap
              </Text>
            </View>
            <TouchableOpacity
              testID="toggle-notif-verdicts"
              onPress={() => setNotifVerdicts(!notifVerdicts)}
              style={[
                styles.togglePill,
                { backgroundColor: notifVerdicts ? theme.primary : theme.border },
              ]}
            >
              <Text style={styles.togglePillText}>
                {notifVerdicts ? 'ENABLED' : 'MUTED'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>
                Weekly Learning Digest
              </Text>
              <Text style={[styles.rowSubLabel, { color: theme.textMuted }]}>
                Summary of completed skills and next available milestones
              </Text>
            </View>
            <TouchableOpacity
              testID="toggle-notif-digest"
              onPress={() => setNotifDigest(!notifDigest)}
              style={[
                styles.togglePill,
                { backgroundColor: notifDigest ? theme.primary : theme.border },
              ]}
            >
              <Text style={styles.togglePillText}>
                {notifDigest ? 'ENABLED' : 'MUTED'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>
                Prerequisite Unlocks
              </Text>
              <Text style={[styles.rowSubLabel, { color: theme.textMuted }]}>
                Alerts when downstream advanced nodes become available
              </Text>
            </View>
            <TouchableOpacity
              testID="toggle-notif-unlocks"
              onPress={() => setNotifUnlocks(!notifUnlocks)}
              style={[
                styles.togglePill,
                { backgroundColor: notifUnlocks ? theme.primary : theme.border },
              ]}
            >
              <Text style={styles.togglePillText}>
                {notifUnlocks ? 'ENABLED' : 'MUTED'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Appearance Preferences */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>APPEARANCE</Text>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Theme</Text>
            <Button
              testID="toggle-theme-button"
              title={isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
              variant="outline"
              size="sm"
              onPress={toggleTheme}
            />
          </View>
        </View>

        {/* 5. Privacy, Export & Data Control (PRD Section 14) */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            DATA & COMPLIANCE (DPDP / GDPR)
          </Text>

          {exportNotice ? (
            <Text style={[styles.successText, { color: theme.success, marginBottom: 8 }]}>
              {exportNotice}
            </Text>
          ) : null}

          <View style={styles.buttonStack}>
            <Button
              testID="export-data-button"
              title="📥 Export My Learning Data (JSON)"
              variant="outline"
              onPress={handleExportData}
              style={{ marginBottom: 12 }}
            />
            <Button
              testID="delete-account-button"
              title="⚠️ Delete My Account"
              variant="outline"
              onPress={handleDeleteAccount}
            />
          </View>
        </View>

        {/* 6. Editorial Dashboard (Web only) */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Button
            testID="open-editorial-dashboard-button"
            title="🛠️ Open Editorial Dashboard (Web)"
            variant="outline"
            onPress={() => router.push('/(editor)' as any)}
          />
        </View>

        {/* 7. Sign Out */}
        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Button
            testID="profile-signout-button"
            title="Sign Out"
            variant="danger"
            onPress={handleSignOut}
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    width: '100%',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  userMeta: {
    flex: 1,
  },
  displayName: {
    fontWeight: '700',
  },
  email: {
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    paddingTop: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    marginRight: 12,
  },
  saveNameButton: {
    minHeight: 44,
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  successBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  stackEditorContainer: {
    padding: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  invariantNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    marginBottom: 16,
  },
  invariantIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  invariantText: {
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
  areaBlock: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  areaIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  areaName: {
    fontSize: 15,
    fontWeight: '700',
  },
  areaDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 10,
  },
  levelButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  levelPillText: {
    fontSize: 11,
  },
  toolsLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  toolPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 4,
    marginBottom: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  toolPillText: {
    fontSize: 12,
  },
  saveStackRow: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  togglePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 70,
    alignItems: 'center',
  },
  togglePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  buttonStack: {
    marginTop: 4,
  },
});
