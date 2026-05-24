import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchOptionsChain, formatOI, getPercentATM, OptionsChainData, StrikeRow } from '@/utils/optionsChain';

export default function OptionsChainScreen() {
  const [data, setData] = useState<OptionsChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExpiry, setSelectedExpiry] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'oi' | 'greeks'>('oi');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const chainData = await fetchOptionsChain(selectedExpiry);
        setData(chainData);
        if (!selectedExpiry && chainData.expiry) {
          setSelectedExpiry(chainData.expiry);
        }
      } catch (error) {
        console.error("Failed to fetch options chain:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [selectedExpiry]);

  const atmIndex = useMemo(() => {
    if (!data?.strikes || !data.spot) return -1;
    let closest = -1;
    let minDiff = Infinity;
    data.strikes.forEach((s, i) => {
      const diff = Math.abs(s.strike - data.spot);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    });
    return closest;
  }, [data]);

  const renderRow = (row: StrikeRow, index: number) => {
    const isITMCall = row.strike < (data?.spot ?? 0);
    const isITMPut = row.strike > (data?.spot ?? 0);
    const isATM = index === atmIndex;

    const callStyle = [styles.cell, isITMCall && styles.itmCell];
    const putStyle = [styles.cell, isITMPut && styles.itmCell];
    const strikeStyle = [styles.strikeCell, isATM && styles.atmStrikeCell];

    return (
      <View key={row.strike} style={styles.row}>
        {activeTab === 'oi' ? (
          <>
            <View style={callStyle}><Text style={styles.cellText}>{formatOI(row.ce.oi)}</Text></View>
            <View style={callStyle}><Text style={styles.cellText}>{formatOI(row.ce.volume)}</Text></View>
          </>
        ) : (
          <>
            <View style={callStyle}>
              <Text style={styles.cellText}>₹{row.ce.ltp.toFixed(2)}</Text>
              <Text style={styles.greekText}>Δ {row.ce.delta?.toFixed(2)}</Text>
            </View>
            <View style={callStyle}>
              <Text style={styles.cellText}>{row.ce.iv?.toFixed(1)}%</Text>
              <Text style={styles.greekText}>Θ {row.ce.theta?.toFixed(2)}</Text>
            </View>
          </>
        )}
        
        <View style={strikeStyle}>
          <Text style={styles.strikeText}>{row.strike}</Text>
          <Text style={styles.atmPctText}>{getPercentATM(row.strike, data?.spot ?? 0)}</Text>
        </View>

        {activeTab === 'oi' ? (
          <>
            <View style={putStyle}><Text style={styles.cellText}>{formatOI(row.pe.volume)}</Text></View>
            <View style={putStyle}><Text style={styles.cellText}>{formatOI(row.pe.oi)}</Text></View>
          </>
        ) : (
          <>
            <View style={putStyle}>
              <Text style={styles.cellText}>{row.pe.iv?.toFixed(1)}%</Text>
              <Text style={styles.greekText}>Θ {row.pe.theta?.toFixed(2)}</Text>
            </View>
            <View style={putStyle}>
              <Text style={styles.cellText}>₹{row.pe.ltp.toFixed(2)}</Text>
              <Text style={styles.greekText}>Δ {row.pe.delta?.toFixed(2)}</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Options Chain</Text>
        {data && <Text style={styles.spotPrice}>Bank Nifty: {data.spot.toFixed(2)}</Text>}
      </View>

      {/* Wrap with explicit minHeight to prevent ScrollView from collapsing, and check if array exists */}
      <View style={styles.expiryWrapper}>
        {(() => {
          const expiries = data?.availableExpiries || (data as any)?.expiries || (data as any)?.expiryDates || (data as any)?.records?.expiryDates || [];
          if (expiries.length === 0) {
            return <Text style={styles.errorText}>No expiry dates received from API.</Text>;
          }
          return (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.expiryContainer}
            >
              {expiries.map((expiry: string) => (
                <TouchableOpacity 
                  key={expiry}
                  style={[styles.expiryButton, selectedExpiry === expiry && styles.selectedExpiryButton]}
                  onPress={() => setSelectedExpiry(expiry)}
                >
                  <Text style={[styles.expiryText, selectedExpiry === expiry && styles.selectedExpiryText]}>{expiry}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          );
        })()}
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'oi' && styles.activeTab]} onPress={() => setActiveTab('oi')}>
          <Text style={[styles.tabText, activeTab === 'oi' && styles.activeTabText]}>OI & Volume</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'greeks' && styles.activeTab]} onPress={() => setActiveTab('greeks')}>
          <Text style={[styles.tabText, activeTab === 'greeks' && styles.activeTabText]}>Price & Greeks</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={{ flex: 1 }} />
      ) : !data ? (
        <View style={styles.centered}><Text style={{color: 'white'}}>Could not load options chain.</Text></View>
      ) : (
        <>
          <View style={styles.tableHeader}>
            <Text style={styles.headerText}>{activeTab === 'oi' ? 'Call OI' : 'Call LTP'}</Text>
            <Text style={styles.headerText}>{activeTab === 'oi' ? 'Call Vol' : 'Call IV'}</Text>
            <Text style={styles.headerText}>Strike</Text>
            <Text style={styles.headerText}>{activeTab === 'oi' ? 'Put Vol' : 'Put IV'}</Text>
            <Text style={styles.headerText}>{activeTab === 'oi' ? 'Put OI' : 'Put LTP'}</Text>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {data.strikes.map(renderRow)}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  spotPrice: { fontSize: 16, color: '#9ca3af', marginTop: 4 },
  expiryWrapper: { minHeight: 50, maxHeight: 60, justifyContent: 'center' },
  errorText: { color: '#f87171', textAlign: 'center', fontSize: 13, paddingVertical: 10 },
  expiryContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  expiryButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#374151', borderRadius: 20, marginRight: 8 },
  selectedExpiryButton: { backgroundColor: '#3b82f6' },
  expiryText: { color: 'white', fontWeight: '600' },
  selectedExpiryText: { color: 'white' },
  tabsContainer: { flexDirection: 'row', backgroundColor: '#1f2937', marginHorizontal: 16, borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 6 },
  activeTab: { backgroundColor: '#374151' },
  tabText: { textAlign: 'center', fontWeight: '600', color: '#9ca3af' },
  activeTabText: { color: 'white' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#374151' },
  headerText: { color: '#9ca3af', fontWeight: 'bold', flex: 1, textAlign: 'center', fontSize: 12 },
  scrollContent: { paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  cell: { flex: 2, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' },
  cellText: { color: 'white', fontSize: 13, fontWeight: '500' },
  strikeCell: { flex: 1.5, padding: 10, alignItems: 'center', backgroundColor: '#1f2937' },
  strikeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  atmPctText: { color: '#9ca3af', fontSize: 10, marginTop: 2 },
  itmCell: { backgroundColor: 'rgba(30, 58, 138, 0.3)' },
  atmStrikeCell: { borderWidth: 1, borderColor: '#f59e0b' },
  greekText: { color: '#6b7280', fontSize: 10, marginTop: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});