import { useState, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  Calendar,
  Clock,
  Car,
  Shield,
  Briefcase,
  MapPin,
  CreditCard,
} from 'lucide-react-native';
import { guardService } from '@/services/guardService';
import Colors from '@/constants/colors';
import type { VehicleType, ProtectionType, DressCode, RouteStop, Guard } from '@/types';
import MapView, { Marker, PROVIDER_DEFAULT } from '@/components/MapView';
import PaymentSheet from '@/components/PaymentSheet';
import { paymentService } from '@/services/paymentService';
import { bookingService } from '@/services/bookingService';
import { useAuth } from '@/contexts/AuthContext';

// Estilo del <input type="date"/"time"> nativo del navegador para que se
// vea como el resto de inputContainer (sin borde/fondo propio, mismo color
// y tamano de texto que Colors.textPrimary).
const webDateTimeInputStyle: CSSProperties = {
  flex: 1,
  fontSize: 14,
  color: Colors.textPrimary,
  backgroundColor: 'transparent',
  border: 'none',
  outline: 'none',
  fontFamily: 'inherit',
  colorScheme: 'dark',
};

export default function CreateBookingScreen() {
  const { guardId } = useLocalSearchParams<{ guardId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [vehicleType, setVehicleType] = useState<VehicleType>('standard');
  const [protectionType, setProtectionType] = useState<ProtectionType>('unarmed');
  const [dressCode, setDressCode] = useState<DressCode>('business_casual');
  const [numberOfProtectors, setNumberOfProtectors] = useState<number>(1);
  const [numberOfProtectees, setNumberOfProtectees] = useState<number>(1);
  const [duration, setDuration] = useState<number>(4);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [scheduledTime, setScheduledTime] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  // Playa del Carmen mientras llega la ubicacion real. Antes decia
  // 40.7580 / -73.9855, que es Manhattan: TODAS las reservas se guardaban con
  // coordenadas de Nueva York sin importar la direccion escrita, y eso rompe
  // distancias, emparejamiento por cercania y el seguimiento en vivo.
  const [pickupCoords, setPickupCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 20.6296,
    longitude: -87.0739,
  });
  const [ubicacionResuelta, setUbicacionResuelta] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [showRouteBuilder, setShowRouteBuilder] = useState<boolean>(false);
  const [newStopAddress, setNewStopAddress] = useState<string>('');
  const [showPayment, setShowPayment] = useState<boolean>(false);

  // Ubicacion real del dispositivo. En web expo-location usa la geolocalizacion
  // del navegador. Si el usuario la niega o falla, se queda el centro de Playa
  // del Carmen, que al menos esta en el pais correcto.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (permiso.status !== 'granted') {
          console.log('[Booking] Sin permiso de ubicacion, se usa el centro por defecto');
          return;
        }
        const posicion = await Location.getCurrentPositionAsync({});
        if (cancelado) return;
        setPickupCoords({
          latitude: posicion.coords.latitude,
          longitude: posicion.coords.longitude,
        });
        setUbicacionResuelta(true);
      } catch (error) {
        console.log('[Booking] No se pudo obtener la ubicacion:', error);
      }
    })();
    return () => { cancelado = true; };
  }, []);
  const [tempBookingId, setTempBookingId] = useState<string>('');
  const { user } = useAuth();

  const handleDateChange = useCallback((event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setScheduledDate(selectedDate);
    }
  }, []);

  const handleTimeChange = useCallback((event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setScheduledTime(selectedTime);
    }
  }, []);

  // @react-native-community/datetimepicker no tiene implementacion en web
  // ("DateTimePicker is not supported on: web" en consola) — los
  // TouchableOpacity de Schedule no hacian nada, no habia forma de cambiar
  // fecha u hora en el navegador. En web se usa <input type="date"/"time">
  // nativo del navegador en su lugar; en iOS/Android sigue el picker nativo
  // de siempre, sin cambios.
  const handleWebDateChange = useCallback((e: any) => {
    const value = e.target.value as string;
    const [year, month, day] = value.split('-').map(Number);
    if (year && month && day) {
      const next = new Date(scheduledDate);
      next.setFullYear(year, month - 1, day);
      setScheduledDate(next);
    }
  }, [scheduledDate]);

  const handleWebTimeChange = useCallback((e: any) => {
    const value = e.target.value as string;
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      const next = new Date(scheduledTime);
      next.setHours(hours, minutes, 0, 0);
      setScheduledTime(next);
    }
  }, [scheduledTime]);

  const [guard, setGuard] = useState<Guard | null>(null);
  const [isLoadingGuard, setIsLoadingGuard] = useState(true);

  useEffect(() => {
    if (!guardId) return;
    setIsLoadingGuard(true);
    guardService.getGuardById(guardId).then((result) => {
      setGuard(result);
      setIsLoadingGuard(false);
    });
  }, [guardId]);

  if (isLoadingGuard) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      </View>
    );
  }

  if (!guard) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Shield size={64} color={Colors.textTertiary} />
          <Text style={styles.errorText}>Guard not found</Text>
        </View>
      </View>
    );
  }

  const baseRate = guard.hourlyRate;
  const vehicleMultiplier = vehicleType === 'armored' ? 1.5 : 1;
  const protectionMultiplier = protectionType === 'armed' ? 1.3 : 1;
  const protectorMultiplier = numberOfProtectors;

  const breakdown = paymentService.calculateBreakdown(baseRate * vehicleMultiplier * protectionMultiplier * protectorMultiplier, duration);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const toDateInputValue = (date: Date): string =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const toTimeInputValue = (date: Date): string =>
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  const handleBooking = async () => {
    console.log('[Booking] Proceed to Payment button pressed!');
    console.log('[Booking] Current user:', user?.id);
    console.log('[Booking] Pickup address:', pickupAddress);
    
    if (!pickupAddress) {
      console.log('[Booking] Missing pickup address');
      Alert.alert('Missing Information', 'Please enter a pickup address');
      return;
    }

    if (!user?.id) {
      console.log('[Booking] User not logged in');
      Alert.alert('Error', 'You must be logged in to book');
      return;
    }

    console.log('[Booking] Starting booking creation...');
    try {
      const booking = await bookingService.createBooking({
        clientId: user.id,
        guardId: guardId,
        vehicleType,
        protectionType,
        dressCode,
        numberOfProtectees,
        numberOfProtectors,
        scheduledDate: scheduledDate.toISOString().split('T')[0],
        scheduledTime: scheduledTime.toTimeString().split(' ')[0],
        duration,
        pickupAddress,
        pickupLatitude: pickupCoords.latitude,
        pickupLongitude: pickupCoords.longitude,
        destinationAddress: destinationAddress || undefined,
        routeStops: routeStops.length > 0 ? routeStops : undefined,
        totalAmount: breakdown.total,
        processingFee: breakdown.processingFee,
        platformCut: breakdown.platformCut,
        guardPayout: breakdown.guardPayout,
      });

      console.log('[Booking] Booking creation successful:', booking.id);
      setTempBookingId(booking.id);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      console.log('[Booking] Showing payment sheet...');
      setShowPayment(true);
    } catch (error) {
      console.error('[Booking] Error creating booking:', error);
      Alert.alert('Error', 'Failed to create booking. Please try again.');
    }
  };

  const handlePaymentSuccess = async (transactionId: string) => {
    try {
      console.log('[Booking] Payment successful:', transactionId);
      
      await bookingService.confirmBookingPayment(tempBookingId, transactionId);
      console.log('[Booking] Booking confirmed with payment');
      
      setShowPayment(false);
      router.replace(`/booking/${tempBookingId}` as any);
    } catch (error) {
      console.error('[Booking] Error after payment:', error);
      Alert.alert('Error', 'Payment succeeded but booking confirmation failed.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Protection</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.guardInfo}>
            <Text style={styles.guardName}>
              {guard.firstName} {guard.lastName.charAt(0)}.
            </Text>
            <Text style={styles.guardRate}>${guard.hourlyRate}/hr base rate</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Protection Type</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  protectionType === 'unarmed' && styles.optionButtonActive,
                ]}
                onPress={() => setProtectionType('unarmed')}
              >
                <Shield size={20} color={protectionType === 'unarmed' ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.optionText, protectionType === 'unarmed' && styles.optionTextActive]}>
                  Unarmed
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  protectionType === 'armed' && styles.optionButtonActive,
                ]}
                onPress={() => setProtectionType('armed')}
              >
                <Shield size={20} color={protectionType === 'armed' ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.optionText, protectionType === 'armed' && styles.optionTextActive]}>
                  Armed (+30%)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Type</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  vehicleType === 'standard' && styles.optionButtonActive,
                ]}
                onPress={() => setVehicleType('standard')}
              >
                <Car size={20} color={vehicleType === 'standard' ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.optionText, vehicleType === 'standard' && styles.optionTextActive]}>
                  Standard
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  vehicleType === 'armored' && styles.optionButtonActive,
                ]}
                onPress={() => setVehicleType('armored')}
              >
                <Car size={20} color={vehicleType === 'armored' ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.optionText, vehicleType === 'armored' && styles.optionTextActive]}>
                  Armored (+50%)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dress Code</Text>
            <View style={styles.optionGrid}>
              {(['suit', 'business_casual', 'tactical', 'casual'] as DressCode[]).map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.optionButtonSmall,
                    dressCode === code && styles.optionButtonActive,
                  ]}
                  onPress={() => setDressCode(code)}
                >
                  <Briefcase size={16} color={dressCode === code ? Colors.background : Colors.textSecondary} />
                  <Text style={[styles.optionTextSmall, dressCode === code && styles.optionTextActive]}>
                    {code.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Number of Protectors</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setNumberOfProtectors(Math.max(1, numberOfProtectors - 1))}
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{numberOfProtectors}</Text>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setNumberOfProtectors(Math.min(5, numberOfProtectors + 1))}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Number of Protectees</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setNumberOfProtectees(Math.max(1, numberOfProtectees - 1))}
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{numberOfProtectees}</Text>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setNumberOfProtectees(Math.min(10, numberOfProtectees + 1))}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Duration (hours)</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setDuration(Math.max(1, duration - 1))}
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{duration}</Text>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setDuration(Math.min(24, duration + 1))}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.inputRow}>
                <View style={styles.inputContainer}>
                  <Calendar size={16} color={Colors.textSecondary} />
                  <input
                    type="date"
                    value={toDateInputValue(scheduledDate)}
                    min={toDateInputValue(new Date())}
                    onChange={handleWebDateChange}
                    style={webDateTimeInputStyle}
                  />
                </View>
                <View style={styles.inputContainer}>
                  <Clock size={16} color={Colors.textSecondary} />
                  <input
                    type="time"
                    value={toTimeInputValue(scheduledTime)}
                    onChange={handleWebTimeChange}
                    style={webDateTimeInputStyle}
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.inputRow}>
                  <TouchableOpacity
                    style={styles.inputContainer}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Calendar size={16} color={Colors.textSecondary} />
                    <Text style={styles.inputText}>{formatDate(scheduledDate)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inputContainer}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Clock size={16} color={Colors.textSecondary} />
                    <Text style={styles.inputText}>{formatTime(scheduledTime)}</Text>
                  </TouchableOpacity>
                </View>
                {showDatePicker && (
                  <DateTimePicker
                    value={scheduledDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    minimumDate={new Date()}
                  />
                )}
                {showTimePicker && (
                  <DateTimePicker
                    value={scheduledTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleTimeChange}
                  />
                )}
              </>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pickup Location</Text>
            <View style={styles.inputContainer}>
              <MapPin size={16} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="Enter pickup address"
                placeholderTextColor={Colors.textTertiary}
                value={pickupAddress}
                onChangeText={setPickupAddress}
              />
            </View>
            <TouchableOpacity 
              style={styles.mapToggleButton}
              onPress={() => setShowMap(!showMap)}
            >
              <MapPin size={16} color={Colors.gold} />
              <Text style={styles.mapToggleText}>
                {showMap ? 'Hide Map' : 'Show Map'}
              </Text>
            </TouchableOpacity>
            {showMap && (
              <View style={styles.mapContainer}>
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={styles.map}
                  initialRegion={{
                    latitude: pickupCoords.latitude,
                    longitude: pickupCoords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  onPress={(e: any) => {
                    if (e?.nativeEvent?.coordinate) {
                      setPickupCoords(e.nativeEvent.coordinate);
                    }
                  }}
                >
                  <Marker coordinate={pickupCoords} title="Pickup Location" />
                </MapView>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Destination (Optional)</Text>
            <View style={styles.inputContainer}>
              <MapPin size={16} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="Enter destination address"
                placeholderTextColor={Colors.textTertiary}
                value={destinationAddress}
                onChangeText={setDestinationAddress}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Multi-Stop Route (Optional)</Text>
              <TouchableOpacity
                style={styles.toggleRouteButton}
                onPress={() => setShowRouteBuilder(!showRouteBuilder)}
              >
                <Text style={styles.toggleRouteText}>
                  {showRouteBuilder ? 'Hide' : 'Add Stops'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {showRouteBuilder && (
              <View style={styles.routeBuilder}>
                <View style={styles.inputContainer}>
                  <MapPin size={16} color={Colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter stop address"
                    placeholderTextColor={Colors.textTertiary}
                    value={newStopAddress}
                    onChangeText={setNewStopAddress}
                  />
                </View>
                <TouchableOpacity
                  style={styles.addStopButton}
                  onPress={() => {
                    if (newStopAddress.trim()) {
                      setRouteStops([...routeStops, {
                        address: newStopAddress,
                        latitude: pickupCoords.latitude + (Math.random() - 0.5) * 0.01,
                        longitude: pickupCoords.longitude + (Math.random() - 0.5) * 0.01,
                        order: routeStops.length + 1,
                      }]);
                      setNewStopAddress('');
                    }
                  }}
                >
                  <Text style={styles.addStopButtonText}>Add Stop</Text>
                </TouchableOpacity>

                {routeStops.length > 0 && (
                  <View style={styles.stopsContainer}>
                    <Text style={styles.stopsTitle}>Route Stops ({routeStops.length})</Text>
                    {routeStops.map((stop, index) => (
                      <View key={index} style={styles.stopItem}>
                        <View style={styles.stopNumber}>
                          <Text style={styles.stopNumberText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.stopAddress} numberOfLines={1}>{stop.address}</Text>
                        <TouchableOpacity
                          style={styles.removeStopButton}
                          onPress={() => {
                            setRouteStops(routeStops.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
                          }}
                        >
                          <Text style={styles.removeStopText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.priceBreakdown}>
            <Text style={styles.breakdownTitle}>Price Breakdown</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>
                Base rate ({duration}h × {numberOfProtectors} protector{numberOfProtectors > 1 ? 's' : ''})
              </Text>
              <Text style={styles.breakdownValue}>${(baseRate * duration * numberOfProtectors).toFixed(2)}</Text>
            </View>
            {vehicleType === 'armored' && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Armored vehicle (+50%)</Text>
                <Text style={styles.breakdownValue}>
                  +${((baseRate * duration * numberOfProtectors * 0.5)).toFixed(2)}
                </Text>
              </View>
            )}
            {protectionType === 'armed' && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Armed protection (+30%)</Text>
                <Text style={styles.breakdownValue}>
                  +${((baseRate * duration * numberOfProtectors * vehicleMultiplier * 0.3)).toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Processing fee</Text>
              <Text style={styles.breakdownValue}>{paymentService.formatMXN(breakdown.processingFee)}</Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownTotal}>Total</Text>
              <Text style={styles.breakdownTotalValue}>{paymentService.formatMXN(breakdown.total)}</Text>
            </View>
          </View>

          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerValue}>{paymentService.formatMXN(breakdown.total)}</Text>
        </View>
        <TouchableOpacity style={styles.confirmButton} onPress={handleBooking}>
          <CreditCard size={20} color={Colors.background} />
          <Text style={styles.confirmButtonText}>Proceed to Payment</Text>
        </TouchableOpacity>
      </View>

      {user?.id && tempBookingId && (
        <PaymentSheet
          visible={showPayment}
          amount={breakdown.total}
          breakdown={breakdown}
          userId={user.id}
          bookingId={tempBookingId}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setShowPayment(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  guardInfo: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guardName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  guardRate: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionButtonActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  optionTextActive: {
    color: Colors.background,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionTextSmall: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'capitalize' as const,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  counterButton: {
    width: 48,
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  counterButtonText: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  counterValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    minWidth: 40,
    textAlign: 'center' as const,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  mapToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 12,
  },
  mapToggleText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gold,
  },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  map: {
    width: '100%',
    height: '100%',
  },

  priceBreakdown: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  breakdownTotal: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  breakdownTotalValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.gold,
  },
  bottomPadding: {
    height: 100,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerLeft: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.gold,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleRouteButton: {
    backgroundColor: Colors.gold + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleRouteText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.gold,
  },
  routeBuilder: {
    gap: 12,
  },
  addStopButton: {
    backgroundColor: Colors.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addStopButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  stopsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stopsTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumberText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  stopAddress: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  removeStopButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.error + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeStopText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.error,
  },
});
