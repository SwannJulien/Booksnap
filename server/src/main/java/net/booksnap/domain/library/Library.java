package net.booksnap.domain.library;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import net.booksnap.domain.Auditable;

@Entity
@Table(name = "library")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Library extends Auditable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, columnDefinition = "citext")
    private String name;

    @Column(name = "borrowing_duration_days", nullable = false, insertable = false)
    private Integer borrowingDurationDays;

    @Column(name = "pickup_window_days", nullable = false, insertable = false)
    private Integer pickupWindowDays;
}
