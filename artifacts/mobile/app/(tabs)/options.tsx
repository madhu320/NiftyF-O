import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Prioritize Expo environment variable (for Render), fallback to local development IPs
const API_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

export default function OptionsEvaluator() {
  const [data, setData] = useState<any>(null);
  const [predictData, setPredictData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  const fetchMarketSignals = async () => {
    try {
      setLoading(true);
      const [signalsRes, predictRes] = await Promise.all([
        fetch(`${API_URL}/signals`),
        fetch(`${API_URL}/predict`)
      ]);
      const signalsJson = await signalsRes.json();
      const predictJson = await predictRes.json();
      setData(signalsJson);
      setPredictData(predictJson);
    } catch (error) {
      console.error('Failed to fetch signals', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketSignals();
  }, []);

  const executeTrade = async () => {
    if (!data?.aggregatedSignal) return;
    
    setExecuting(true);
    try {
      const res = await fetch(`${API_URL}/execute-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: {
            action: data.aggregatedSignal.action,
            price: data.marketData.bankNifty
          },
          positionSize: data.positionSize || 0.05,
          riskMultiplier: 1.0
        })
      });
      const result = await res.json();
      
      if (result.success) {
        Alert.alert("Order Placed", result.message);
      } else {
        Alert.alert("Execution Blocked", result.message);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to contact execution engine");
    } finally {
      setExecuting(false);
      fetchMarketSignals(); // Refresh data
    }
  };

  if (loading && !data) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  const agg = data?.aggregatedSignal;
  const isBullish = agg?.action === 'BUY';
  const isBearish = agg?.action === 'SELL';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Bank Nifty Options</Text>
          <TouchableOpacity onPress={fetchMarketSignals}>
            <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, color: '#6b7280' }}>Live Spot Price</Text>
          <Text style={{ fontSize: 32, fontWeight: 'bold', marginVertical: 8 }}>₹{data?.marketData?.bankNifty?.toFixed(2)}</Text>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: '#e5e7eb' }}>
            <View><Text style={{ color: '#6b7280' }}>RSI</Text><Text style={{ fontWeight: 'bold' }}>{data?.marketData?.rsi?.toFixed(1)}</Text></View>
            <View><Text style={{ color: '#6b7280' }}>Volatility</Text><Text style={{ fontWeight: 'bold' }}>{(data?.marketData?.volatility * 100)?.toFixed(2)}%</Text></View>
          </View>
        </View>

        {predictData && (
          <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>AI Market Prediction</Text>
            <Text style={{ 
              fontSize: 24, 
              fontWeight: 'bold', 
              color: predictData.prediction === 'call' ? '#166534' : predictData.prediction === 'put' ? '#991b1b' : '#ca8a04', 
              marginTop: 4 }}>
              {predictData.prediction === 'call' ? 'BULLISH (BUY CALL)' : predictData.prediction === 'put' ? 'BEARISH (BUY PUT)' : 'CHOPPY (WAIT/HOLD)'}
            </Text>
            <Text style={{ fontSize: 14, marginTop: 8, color: '#4b5563' }}>Sentiment Score: {predictData.sentiment} / 100</Text>
          </View>
        )}

        <View style={{ backgroundColor: isBullish ? '#dcfce7' : isBearish ? '#fee2e2' : '#f3f4f6', padding: 20, borderRadius: 12, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: '#4b5563', marginBottom: 4 }}>Algorithmic Recommendation</Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: isBullish ? '#166534' : isBearish ? '#991b1b' : '#374151' }}>
            {agg?.action === 'HOLD' ? 'STAY FLAT (HOLD)' : `${agg?.action} ${isBullish ? 'CALL (CE)' : 'PUT (PE)'}`}
          </Text>
          <Text style={{ fontSize: 14, marginTop: 8, color: '#4b5563' }}>Confidence: {agg?.confidence?.toFixed(1)}%</Text>
          
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Reasoning Checklist:</Text>
            {agg?.reasoning?.map((reason: string, idx: number) => (
              <Text key={idx} style={{ fontSize: 13, marginBottom: 2 }}>• {reason}</Text>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          onPress={executeTrade}
          disabled={agg?.action === 'HOLD' || executing}
          style={{ backgroundColor: agg?.action === 'HOLD' ? '#9ca3af' : '#111827', padding: 16, borderRadius: 12, alignItems: 'center' }}
        >
          {executing ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Execute Recommended Trade</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
